/** Manual mock for next/server — used in vitest tests */

type JsonInit = { status?: number; headers?: Record<string, string> };

export class NextResponse {
  readonly status: number;
  readonly ok: boolean;
  private readonly _body: unknown;
  readonly headers: Headers;

  constructor(body: unknown, init: JsonInit = {}) {
    this.status = init.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
    this._body = body;
    this.headers = new Headers({ 'content-type': 'application/json', ...init.headers });
  }

  async json() {
    return this._body;
  }

  static json(data: unknown, init: JsonInit = {}): NextResponse {
    return new NextResponse(data, init);
  }

  static redirect(url: string, status = 302): NextResponse {
    return new NextResponse(null, { status, headers: { location: url } });
  }

  static next(): NextResponse {
    return new NextResponse(null, { status: 200 });
  }
}
