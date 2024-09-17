import { HttpStatus, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrismaClient } from '@prisma/client';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { ChangeOrderStatusDto, PaidOrderDto } from './dto';
import { NATS_SERVICE, PRODUCT_SERVICE } from 'src/config/services';
import { firstValueFrom } from 'rxjs';
import { OrderProduct } from './dto/interfaces/order-product.interface';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {

  constructor(
    @Inject(NATS_SERVICE) private readonly client: ClientProxy
  ) {
    super();
  }


  async onModuleInit() {
    await this.$connect();
  }

  async create(createOrderDto: CreateOrderDto) {
    try {
      const productIds = createOrderDto.items.map((p) => (p.productId));
      const products = await firstValueFrom(this.client.send({ cmd: 'validate_products' }, { ids: productIds }));

      const totalAmount = createOrderDto.items.reduce((acc, orderItem) => {
        const price = products.find(
          (product) => product.id === orderItem.productId).price;
        return price * orderItem.quantity
      }, 0)

      const totalItems = createOrderDto.items.reduce((acc, orderItem) => {
        return acc + orderItem.quantity
      }, 0)

      const order = await this.order.create({
        data: {
          totalAmount, totalItems,
          OrderItem: {
            createMany: {
              data: createOrderDto.items.map((orderItem) => ({
                quantity: orderItem.quantity,
                productId: orderItem.productId,
                price: products.find((p) => p.id === orderItem.productId).price
              }))
            }
          }
        },
        include: {
          OrderItem: {
            select: {
              price: true,
              quantity: true,
              productId: true
            }
          }
        }
      });
      return {
        ...order,
        OrderItem: order.OrderItem.map((orderItem) => ({
          ...orderItem,
          productName: products.find((p) => p.id === orderItem.productId).name
        }))
      };
    } catch (error) {
      throw new RpcException(error)
    }
  }

  async findAll(orderPaginationDto: OrderPaginationDto) {
    const totalPages = await this.order.count({
      where: {
        status: orderPaginationDto.status
      }
    });

    const currentPage = orderPaginationDto.page;
    const perPage = orderPaginationDto.limit;

    return {
      data: await this.order.findMany({
        skip: (currentPage - 1) * perPage,
        take: perPage,
        where: {
          status: orderPaginationDto.status
        },

      },
      ),
      meta: {
        total: totalPages,
        page: currentPage,
        lastPage: Math.ceil(totalPages / perPage)
      }
    }
  }

  async findOne(id: string) {
    const order = await this.order.findFirst({
      where: { id }, include: {
        OrderItem: {
          select: {
            price: true,
            quantity: true,
            productId: true
          }
        }
      }
    },);
    if (!order) {
      throw new RpcException({
        message: `Order not found ${id}`,
        status: HttpStatus.NOT_FOUND
      })
    }

    const productIds = order.OrderItem.map((orderItem) => (orderItem.productId));
    const products = await firstValueFrom(this.client.send({ cmd: 'validate_products' }, { ids: productIds }));


    return {
      ...order,
      OrderItem: order.OrderItem.map((orderItem) => ({
        ...orderItem,
        productName: products.find((p) => p.id === orderItem.productId).name
      }))
    };
  }


  async changeStatus(changeOrderStatusDto: ChangeOrderStatusDto) {
    const { id, status } = changeOrderStatusDto;
    const order = await this.findOne(id);
    if (order.status === status) {
      return order;
    }
    return this.order.update({
      where: { id },
      data: { status }
    })

  }


  update(id: number, updateOrderDto: UpdateOrderDto) {
    return `This action updates a #${id} order`;
  }

  remove(id: number) {
    return `This action removes a #${id} order`;
  }

  async createPaymentSession(order: OrderProduct) {
    const items = order.OrderItem.map((item) => ({
      name: item.productName,
      price: item.price,
      quantity: item.quantity
    }));
    const paymentSession = await firstValueFrom(
      this.client.send('create.payment.session', {
        orderId: order.id,
        currency: 'usd',
        items
      })
    )
    return paymentSession;
  }

  async paidOrder(paidOrderDto: PaidOrderDto) {
    const order = await this.order.update({
      where: {
        id: paidOrderDto.orderId
      },
      data: {
        status: 'PAID',
        paid: true,
        paidAt: new Date(),
        stripeChargeId: paidOrderDto.stripePaymentId,
        OrderReceipt: {
          create: {
            receiptUrl: paidOrderDto.receiptUrl,
          }
        }
      }
    });
    return order;
  }
}
