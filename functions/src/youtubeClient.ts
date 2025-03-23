import {google} from "googleapis";

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);

oauth2Client.setCredentials({
  refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
});

export const youtube = google.youtube({
  version: "v3",
  auth: oauth2Client,
});

export {oauth2Client};
