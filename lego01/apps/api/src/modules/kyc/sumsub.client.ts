import axios from 'axios';
import crypto from 'crypto';

export class SumsubClient {
  constructor(private appToken: string, private secret: string, private base: string) {}

  private sign(ts: number, method: string, path: string, body?: Buffer) {
    const hmac = crypto.createHmac('sha256', this.secret);
    hmac.update(ts + method + path);
    if (body) hmac.update(body);
    return hmac.digest('hex');
  }

  async createApplicant(externalUserId: string, levelName: string) {
    const path = `/resources/applicants?levelName=${encodeURIComponent(levelName)}&externalUserId=${encodeURIComponent(externalUserId)}`;
    const ts = Math.floor(Date.now() / 1000);
    const sig = this.sign(ts, 'POST', path);
    const { data } = await axios.post(this.base + path, {}, { headers: { 'X-App-Token': this.appToken, 'X-App-Access-Ts': ts, 'X-App-Access-Signature': sig } });
    return data;
  }

  async accessToken(applicantId: string, ttl = 600) {
    const path = `/resources/accessTokens?userId=${applicantId}&ttlInSecs=${ttl}`;
    const ts = Math.floor(Date.now() / 1000);
    const sig = this.sign(ts, 'POST', path);
    const { data } = await axios.post(this.base + path, {}, { headers: { 'X-App-Token': this.appToken, 'X-App-Access-Ts': ts, 'X-App-Access-Signature': sig } });
    return data; // { token, userId, ttlInSecs }
  }
}
