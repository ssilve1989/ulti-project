import { Body, Controller, Logger, Post } from '@nestjs/common';

@Controller('interactions')
class InteractionsController {
  private readonly logger = new Logger(InteractionsController.name);

  @Post()
  handleInteractions(@Body() body: any) {
    this.logger.log(body);
  }
}

export { InteractionsController };
