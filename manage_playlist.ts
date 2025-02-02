export async function manageYouTubeSubscriptionsAndPlaylist({ playlistId }: { playlistId: string }): Promise<object> {
    const days: number = 3;
    const pushToPlaylist = true;

    const allIdsMap: Record<string, string> = {};
    const existingVideoIds = new Set<string>();

    // Function to handle pagination for playlist items
    async function fetchAllPlaylistItems(pageToken: string | null = null): Promise<void> {
        const playlistParams = new URLSearchParams({
            part: 'snippet,contentDetails',
            playlistId: playlistId,
            maxResults: '50'
        });

        if (pageToken) {
            playlistParams.append('pageToken', pageToken);
        }

        const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?${playlistParams.toString()}`;
        const playlistResponse = await fetchWithZapier(playlistUrl);
        await playlistResponse.throwErrorIfNotOk();

        const playlistData = await playlistResponse.json();
        for (const item of playlistData.items) {
            const id = item.contentDetails.videoId;
            const title = item.snippet.title;
            existingVideoIds.add(id);
            allIdsMap[id] = title;
            console.log(`Existing Video: ${id}, Title: ${title}`);
        }

        if (playlistData.nextPageToken) {
            await fetchAllPlaylistItems(playlistData.nextPageToken);
        }
    }

    // Fetch all playlist items
    await fetchAllPlaylistItems();

    const params = new URLSearchParams({
        part: "snippet",
        mine: 'true'
    });
    const subsURL = `https://www.googleapis.com/youtube/v3/subscriptions?${params.toString()}`;

    const response = await fetchWithZapier(subsURL);
    await response.throwErrorIfNotOk();

    const data = await response.json();
    const channels: string[] = data.items.map((item: any) => item.snippet.resourceId.channelId);

    const allIds: string[] = [];
    const baseUrl = 'https://www.googleapis.com/youtube/v3/videos';

    const now = new Date();
    const timeAgo = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
    const timeAgoISO = timeAgo.toISOString();

    for (const channel of channels) {
        const searchParams = new URLSearchParams({
            part: 'id',
            maxResults: '50',
            publishedAfter: timeAgoISO,
            channelId: channel,
            type: 'video'
        });

        const searchUrl = `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`;
        const searchResponse = await fetchWithZapier(searchUrl);
        await searchResponse.throwErrorIfNotOk();

        const searchData = await searchResponse.json();
        const videoIds = searchData.items.map((item: any) => item.id.videoId).join(',');

        const videoParams = new URLSearchParams({
            part: 'contentDetails,snippet',
            id: videoIds
        });

        const videoUrl = `${baseUrl}?${videoParams.toString()}`;
        const videoResponse = await fetchWithZapier(videoUrl);
        await videoResponse.throwErrorIfNotOk();

        const videoData = await videoResponse.json();

        for (const item of videoData.items) {
            const id = item.id;
            const title = item.snippet.title;

            if (!existingVideoIds.has(id)) {
                allIds.push(id);
                allIdsMap[id] = title;
            } else {
                console.log(`Video already in playlist: ${title} ${id}`);
            }
        }
    }

    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet`;

    for (const id of allIds) {
        const title = allIdsMap[id];
        console.log(`Video to be added: ${id} ${title}`);

        if (pushToPlaylist) {
            const requestBody = {
                snippet: {
                    playlistId: playlistId,
                    resourceId: {
                        kind: "youtube#video",
                        videoId: id
                    }
                }
            };

            const response = await fetchWithZapier(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            await response.throwErrorIfNotOk();
        }
    }

    return { videoIds: allIds };
}
