import { NextRequest, NextResponse } from 'next/server';
import { addFeed, deleteFeed, listFeeds } from '../../../../agent/news-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const feeds = listFeeds();
  return NextResponse.json({ feeds });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const url = (body as any)?.url;
  const title = (body as any)?.title ?? null;

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'Field "url" is required' }, { status: 400 });
  }

  try {
    const feed = addFeed(url, typeof title === 'string' ? title : null);
    return NextResponse.json(feed, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const idParam = searchParams.get('id');
  if (!idParam) {
    return NextResponse.json({ error: 'Query parameter "id" is required' }, { status: 400 });
  }

  const id = Number.parseInt(idParam, 10);
  if (Number.isNaN(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid "id" parameter' }, { status: 400 });
  }

  deleteFeed(id);
  return NextResponse.json({ ok: true });
}
