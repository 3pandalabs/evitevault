# Fonts bundled for video invites

`Geist-Regular.ttf` is drawn onto Simple video invites by ffmpeg
(`src/lib/videoInvites/compose.ts`). Geist is by Vercel and licensed under the
SIL Open Font License 1.1 (https://github.com/vercel/geist-font), which allows
bundling and redistribution. This copy comes from the `next` package
(`next/dist/compiled/@vercel/og/Geist-Regular.ttf`).

It is copied into the runtime image by `api/Dockerfile` (`/app/assets`).
