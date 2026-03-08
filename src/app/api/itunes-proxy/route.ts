import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const term = searchParams.get('term');

  if (!term) {
    return NextResponse.json({ results: [] });
  }

  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=album&limit=1`);
    
    if (!res.ok) {
      console.error(`iTunes API error: ${res.status}`);
      return NextResponse.json({ results: [] });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("iTunes proxy error:", error);
    return NextResponse.json({ results: [] }, { status: 500 });
  }
}
