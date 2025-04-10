// server.js with music-metadata and /music/upload route
import express from "express";
import path from "path";
import { engine } from "express-handlebars";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";
import fetch from "node-fetch";
import postgres from "postgres";
import bcrypt from "bcrypt";
// Load environment variables
dotenv.config();
const sql = postgres(process.env.DATABASE_URL);


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VIEWS_DIR = path.join(__dirname, "views");
const PARTIALS_DIR = path.join(VIEWS_DIR, "partials");


const app = express();
const PORT = process.env.PORT || 8083;


app.engine("html", engine({ extname: ".html", defaultLayout: false, partialsDir: PARTIALS_DIR }));
app.set("view engine", "html");
app.set("views", VIEWS_DIR);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/public", express.static(path.join(__dirname, "public")));

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
        console.log("All TSWDB tables created.");
    } catch (error) {
        console.error("DB setup failed:", error);
    }
}

setupDB();
app.get("/", (req, res) => {
  res.render("index", { title: "Home" });
});
app.get("/signup", (req,res)=>{
  res.render("signup",{ title: "Sign Up"});
});
app.get("/login", (req,res)=>{
  res.render("login",{title:"Login"});
});
app.get("/add", (req, res) => res.render("add"));
app.get("/routes", async (req, res) => {
    try {
        const rows = await sql`SELECT * FROM routes ORDER BY id`;
        res.render("routes", { rows });
    } catch (err) {
        console.error("Error loading routes:", err);
        res.status(500).send("Error loading routes");
    }
});

app.post("/api/signup",async(req,res)=>{
  const {username,email,password}=req.body;
  if (!username||!email||!password)return res.status(400).json({error:"Missing Fields"});
  const hashedPassword = await bcrypt.hash(password,10);
  try {
      await sql`INSERT INTO users (username,email,password_hash) VALUES (${username},${email},${hashedPassword})`;
      res.status(201).json({message:"User Created"});
  } catch (err) {
      res.status(400).json({error:"User Allready Created"});
  }
});
app.post("/api/login",async(req,res)=>{
  const {email,password}=req.body;
  if (!email || !password) return res.status(400).json({ error: "Missing Credentials" });
  
  const user = await sql`SELECT * FROM users WHERE email = ${email}`;
  if (user.length === 0) return res.status(400).json({ error: "User Not Found" });
  
  const isValidPassword = await bcrypt.compare(password, user[0].password_hash);
  if (!isValidPassword) return res.status(401).json({ error: "Invalid Password" });
  
  req.session.user = { id: user[0].id, username: user[0].username };
  res.json({ message: "Login Successful", username: user[0].username });
});
if (!process.env.VERCEL && !process.env.NOW_REGION) {
    const PORT = process.env.PORT || 8083;
    app.listen(PORT, () => {
        console.log(`✅ Server running on http://localhost:${PORT}`);
    });
}
export default app;