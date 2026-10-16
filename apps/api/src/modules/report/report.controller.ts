import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresFeature } from '../../common/decorators/feature.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { SalesReportQueryDto } from './dto/report.dto';
import { ReportService } from './report.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportController {
  constructor(private readonly reports: ReportService) {}

  @Get('sales')
  @Roles(Role.Owner, Role.Admin)
  @RequiresFeature('reports')
  sales(@CurrentUser() user: AuthUser, @Query() q: SalesReportQueryDto) {
    return this.reports.salesReport(user.tenantId, q.from, q.to);
  }
}