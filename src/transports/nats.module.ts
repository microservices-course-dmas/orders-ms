import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { envs } from 'src/config';
import { NATS_SERVICE } from 'src/config/services';


const natModule = ClientsModule.register([
    {
        name: NATS_SERVICE,
        transport: Transport.NATS,
        options: {
            servers: envs.natsServers
        }
    }
])

@Module({
    imports: [
        natModule,
    ],
    exports: [
        natModule
    ]
})
export class NatsModule { }
