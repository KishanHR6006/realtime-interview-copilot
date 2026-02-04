import { NextResponse } from 'next/server';

async function getDeepgramKey() {
  const DEEPGRAM_APIKEY = process.env.DEEPGRAM_API_KEY;

  if (!DEEPGRAM_APIKEY) {
    return NextResponse.json({ error: 'Deepgram API key not configured' }, { status: 500 });
  }

  // Get projects
  const projectsResponse = await fetch("https://api.deepgram.com/v1/projects", {
    method: "GET",
    headers: {
      Authorization: `Token ${DEEPGRAM_APIKEY}`,
      accept: "application/json",
    },
  });

  if (!projectsResponse.ok) {
    return NextResponse.json(await projectsResponse.json(), { status: projectsResponse.status });
  }

  const projectsResult = await projectsResponse.json() as { projects: Array<{ project_id: string }> };

  const project = projectsResult.projects[0];

  if (!project) {
    return NextResponse.json({ error: "No Deepgram project found. Create one first." }, { status: 400 });
  }

  // Create temporary key
  const newKeyResponse = await fetch(
    `https://api.deepgram.com/v1/projects/${project.project_id}/keys`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${DEEPGRAM_APIKEY}`,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        comment: "Temporary for app",
        scopes: ["usage:write"],
        tags: ["nextjs-app"],
        time_to_live_in_seconds: 600, // 10 min – adjust as needed
      }),
    }
  );

  const newKeyResult = await newKeyResponse.json() as Record<string, unknown>;

  if (!newKeyResponse.ok) {
    return NextResponse.json(newKeyResult, { status: newKeyResponse.status });
  }

  return NextResponse.json(newKeyResult);
}

export async function GET() {
  return getDeepgramKey();
}

export async function POST(request: Request) {
  return getDeepgramKey();
}