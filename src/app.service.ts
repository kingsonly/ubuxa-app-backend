import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AppService {
   private readonly logger = new Logger(AppService.name);
  getHello(): string {

    return 'Welcom to A4t!proo';
  }

  //   @Cron(CronExpression.EVERY_30_SECONDS)
  // handleCron() {
  //       console.log('Called when the current second is 45');

  //   this.logger.debug('Called every 30 seconds');
  // }
}
 