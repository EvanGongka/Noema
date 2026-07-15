import { Module } from '@nestjs/common';
import { NotesModule } from '../notes/notes.module';
import { TransferController } from './transfer.controller';
import { TransferService } from './transfer.service';

@Module({ imports: [NotesModule], controllers: [TransferController], providers: [TransferService] })
export class TransferModule {}
