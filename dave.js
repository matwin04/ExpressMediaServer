import { v2 as webdav } from "webdav-server";
import fs from "fs";
import path from "path";
import { connectDB } from "./database.js";

export async function startWebDAV(port = 7077) {
  const db = await connectDB();
  const users = await db.all("SELECT username, password_hash FROM users");
  const server = new webdav.WebDAVServer({ port });

  for (const { username, password_hash } of users) {
    const userDir = `/NAS/MediaNet/${username}`;
    fs.mkdirSync(userDir, { recursive: true });

    server.userManager.addUser(username, password_hash, false);
    server.setFileSystem(`/${username}`, new webdav.PhysicalFileSystem(userDir), () => {
      console.log(`📁 Mounted ${userDir} at /${username}`);
    });
  }

  server.start(() => {
    console.log(`✅ WebDAV running on http://localhost:${port}`);
  });
}
