import { Controller, Get, Param, Post, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { createReadStream, existsSync } from 'fs';
import { NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { InvoiceService } from './invoice.service';

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('orders/:id/invoice')
export class InvoiceController {
  constructor(private readonly invoices: InvoiceService) {}

  /** Poll this after checkout until status === "ready". */
  @Get()
  async status(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    const order = await this.invoices.getOrder(user.tenantId, id);
    return { status: order.invoiceStatus, invoiceNo: order.invoiceNo };
  }

  @Get('pdf')
  async pdf(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    const order = await this.invoices.getOrder(user.tenantId, id);
    const file = this.invoices.resolvePdfPath(order);
    if (!existsSync(file)) throw new NotFoundException('Invoice PDF not found on disk');
    return new StreamableFile(createReadStream(file), {
      type: 'application/pdf',
      disposition: `inline; filename="${order.invoiceNo}.pdf"`,
    });
  }

  @Post('regenerate')
  @Roles(Role.Owner, Role.Admin)
  regenerate(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.invoices.regenerate(user.tenantId, id);
  }
}
