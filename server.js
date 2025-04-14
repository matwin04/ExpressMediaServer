// server.js - ExpressMediaServer with /NAS/MediaNet storage using .env variables
import express from "express";
import path from "path";
import { engine } from "express-handlebars";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";
import fetch from "node-fetch";
import postgres from "postgres";
import bcrypt from "bcrypt";
import multer from "multer";
import session from "express-session";
import { parseFile } from "music-metadata";

// Load environment variables
dotenv.config();
const sql = postgres(process.env.DATABASE_URL);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VIEWS_DIR = path.join(__dirname, "views");
const PARTIALS_DIR = path.join(VIEWS_DIR, "partials");
const tempUpload = multer({ dest: "temp/" });

const app = express();
const PORT = process.env.PORT || 8083;

app.engine("html", engine({ extname: ".html", defaultLayout: false, partialsDir: PARTIALS_DIR }));
app.set("view engine", "html");
app.set("views", VIEWS_DIR);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/public", express.static(path.join(__dirname, "public")));
app.use(session({
  secret: "supersecretkey",
  resave: false,
  saveUninitialized: false,
}));

const baseDir = process.env.MEDIA_BASE || "/NAS/MediaNet";
const paths = {
  music: process.env.MUSIC_PATH || "Music",
  videos: process.env.VIDEO_PATH || "Videos",
  photos: process.env.PHOTO_PATH || "Photos",
  tvshows: process.env.TVSHOW_PATH || "TVShows"
};

async function setupDB() {
  console.log("Starting DB...");
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`;

    await sql`
      CREATE TABLE IF NOT EXISTS music (
        id SERIAL PRIMARY KEY,
        artist TEXT NOT NULL,
        album TEXT NOT NULL,
        title TEXT,
        filename TEXT NOT NULL,
        path TEXT NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`;

    await sql`
      CREATE TABLE IF NOT EXISTS videos (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL,
        path TEXT NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`;

    await sql`
      CREATE TABLE IF NOT EXISTS tvshows (
        id SERIAL PRIMARY KEY,
        show_name TEXT NOT NULL,
        season INTEGER NOT NULL,
        episode INTEGER,
        filename TEXT NOT NULL,
        path TEXT NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`;

    await sql`
      CREATE TABLE IF NOT EXISTS photos (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL,
        path TEXT NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`;

    console.log("✅ All EMS tables created.");
  } catch (error) {
    console.error("❌ DB setup failed:", error);
  }
}

setupDB();

app.get("/", (req, res) => {
  res.render("index", { title: "Home" });
});

app.get("/signup", (req, res) => {
  res.render("signup", { title: "Sign Up" });
});

app.get("/login", (req, res) => {
  res.render("login", { title: "Login" });
});

app.post("/api/signup", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: "Missing Fields" });
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    await sql`INSERT INTO users (username, email, password_hash) VALUES (${username}, ${email}, ${hashedPassword})`;
    res.status(201).json({ message: "User Created" });
  } catch (err) {
    res.status(400).json({ error: "User Already Exists" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Missing Credentials" });
  const user = await sql`SELECT * FROM users WHERE email = ${email}`;
  if (user.length === 0) return res.status(400).json({ error: "User Not Found" });
  const isValidPassword = await bcrypt.compare(password, user[0].password_hash);
  if (!isValidPassword) return res.status(401).json({ error: "Invalid Password" });
  req.session.user = { id: user[0].id, username: user[0].username };
  res.json({ message: "Login Successful", username: user[0].username });
});

app.get("/music/upload", (req, res) => {
  res.render("music_upload");
});

app.post("/music/upload", tempUpload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).send("No file uploaded");

  let artist = "Unknown Artist";
  let album = "Unknown Album";
  let title = file.originalname;
  try {
    const metadata = await parseFile(file.path);
    artist = metadata.common.artist || artist;
    album = metadata.common.album || album;
    title = metadata.common.title || title;
  } catch (e) {
    console.warn("Metadata extraction failed:", e.message);
  }

  const targetDir = path.join(baseDir, paths.music, artist, album);
  fs.mkdirSync(targetDir, { recursive: true });
  const finalPath = path.join(targetDir, file.originalname);
  fs.renameSync(file.path, finalPath);

  await sql`
    INSERT INTO music (artist, album, title, filename, path)
    VALUES (${artist}, ${album}, ${title}, ${file.originalname}, ${finalPath})`;

  res.send("✅ Music uploaded and stored!");
});

app.get("/tvshows/upload", (req, res) => {
  res.render("tvshows_upload");
});

app.post("/tvshows/upload", tempUpload.single("file"), async (req, res) => {
  const { show_name, season, episode } = req.body;
  const file = req.file;
  if (!file) return res.status(400).send("No file uploaded");

  const targetDir = path.join(baseDir, paths.tvshows, show_name, `Season ${season}`);
  fs.mkdirSync(targetDir, { recursive: true });
  const finalPath = path.join(targetDir, file.originalname);
  fs.renameSync(file.path, finalPath);

  await sql`
    INSERT INTO tvshows (show_name, season, episode, filename, path)
    VALUES (${show_name}, ${season}, ${episode}, ${file.originalname}, ${finalPath})`;

  res.send("✅ TV show uploaded!");
});

if (!process.env.VERCEL && !process.env.NOW_REGION) {
  app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
  });
}

export default app;
