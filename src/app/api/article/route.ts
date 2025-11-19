import { NextRequest, NextResponse } from 'next/server';
import { getArticle } from '../../../../agent/news-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Query parameter "id" is required' }, { status: 400 });
  }

  const article = getArticle(id);
  if (!article) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(article);
}
