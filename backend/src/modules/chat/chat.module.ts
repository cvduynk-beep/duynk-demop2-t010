import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MatchmakerModule } from '../matchmaker/matchmaker.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [AuthModule, MatchmakerModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
