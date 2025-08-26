import { Body, Controller, Get, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import crypto from 'crypto';
import { SumsubClient } from './sumsub.client';

@Controller('kyc')
export class KycController {
  private client = new SumsubClient(process.env.SUMSUB_APP_TOKEN!, process.env.SUMSUB_SECRET!, process.env.SUMSUB_BASE!);
  constructor(private prisma: PrismaService) {}

  @Post('session')
  async session(@Req() req: any) {
    const account = await this.prisma.account.findFirstOrThrow(); // Demo：上线用 JWT 的 sub
    let applicantId: string | null = account.kycApplicantId ?? null;

    if (!applicantId) {
      const created = await this.client.createApplicant(
        account.id,
        process.env.SUMSUB_LEVEL || 'basic-kyc-level'
      );
      applicantId = created.id as string;
      await this.prisma.account.update({
        where: { id: account.id },
        data: { kycApplicantId: applicantId },
      });
    }

    // 二次校验，彻底把类型收窄为 string
    if (!applicantId) {
      throw new Error('Failed to acquire Sumsub applicantId');
    }

    const token = await this.client.accessToken(applicantId);
    return {
      applicant_id: applicantId,
      sumsub_token: token.token,
      expires_in: token.ttlInSecs,
    };

  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: any, @Headers('x-payload-digest') sig: string) {
    const raw: Buffer = req.rawBody; // main.ts 已配置 raw
    const digest = crypto.createHmac('sha256', process.env.SUMSUB_WEBHOOK_SECRET!).update(raw).digest('hex');
    if (digest !== sig) return { ok: false };
    const event = JSON.parse(raw.toString());

    const applicantId = event.applicantId || event.userId;
    const account = await this.prisma.account.findFirstOrThrow({ where: { kycApplicantId: applicantId } });
    if (!account) return { ok: true };

    const type = event.type as string;
    const status = type.includes('APPLICATION_APPROVED') ? 'APPROVED' : type.includes('APPLICATION_REJECTED') ? 'REJECTED' : 'REVIEW';

    await this.prisma.$transaction([
      this.prisma.account.update({ where: { id: account.id }, data: { kycStatus: status as any } }),
      this.prisma.kycEvent.create({ data: { accountId: account.id, applicantId, provider: 'sumsub', type, payload: event } }),
    ]);
    return { ok: true };
  }
}
