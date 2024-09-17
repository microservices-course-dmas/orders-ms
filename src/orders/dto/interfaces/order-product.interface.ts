import { OrderStatus } from "@prisma/client";

export interface OrderProduct{
    OrderItem: {
        productName: any;
        productId: number;
        quantity: number;
        price: number;
    }[];
    id: string;
    totalAmount: number;
    totalItems: number;
    status: OrderStatus;
    paid: boolean;
    paidAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}