import { Module } from '@nestjs/common';
import { TaskController } from './task/task.controller.js';
import { TaskService } from './task/task.service.js';

@Module({
  controllers: [TaskController],
  providers: [TaskService],
})
export class TasksModule {}
