import { NextRequest, NextResponse } from 'next/server';
import { listRecentItems } from '../../../../agent/news-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get('limit') ?? '50';
  const offsetParam = searchParams.get('offset') ?? '0';
  const feedUrl = searchParams.get('feedUrl');

  let limit = Number.parseInt(limitParam, 10);
  let offset = Number.parseInt(offsetParam, 10);

  if (Number.isNaN(limit) || limit <= 0) limit = 50;
  if (limit > 200) limit = 200;
  if (Number.isNaN(offset) || offset < 0) offset = 0;

  const items = listRecentItems(limit, offset).filter((item) =>
    feedUrl ? item.feedUrl === feedUrl : true,
  );

  return NextResponse.json({ items });
}
