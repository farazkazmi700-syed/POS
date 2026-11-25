import { Controller, Get, Param, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { InvoiceService } from './invoice.service';
import { RequiresFeature } from '../../common/decorators/feature.decorator';

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('orders/:id/invoice')
@RequiresFeature('pos')
export class InvoiceController {
  constructor(private readonly invoices: InvoiceService) {}

  /** Poll this after checkout until status === "ready". */
  @SkipThrottle()
  @Get()
  async status(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    const order = await this.invoices.getOrder(user.tenantId, id, user.role === Role.Cashier ? user.userId : undefined);
    return { status: order.invoiceStatus, invoiceNo: order.invoiceNo };
  }

  @Get('pdf')
  async pdf(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Res() res: Response) {
    const order = await this.invoices.getOrder(user.tenantId, id, user.role === Role.Cashier ? user.userId : undefined);
    
    try {
      const stream = await this.invoices.getPdfStream(order);
      if (!stream) {
        throw new NotFoundException('Invoice PDF not found');
      }
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${(order.invoiceNo || 'invoice').replace(/[^A-Za-z0-9._-]+/g, '_')}.pdf"`);
      
      stream.pipe(res);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new NotFoundException('Invoice PDF not found');
    }
  }

  @Post('regenerate')
  @Roles(Role.Owner, Role.Admin)
  regenerate(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.invoices.regenerate(user.tenantId, id);
  }
}
