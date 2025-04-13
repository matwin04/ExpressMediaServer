// server.js with music-metadata and /music/upload route
import express from "express";
import path from "path";
import { engine } from "express-handlebars";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";
import fetch from "node-fetch";
import postgres from "postgres";
// Load environment variables
dotenv.config();
const sql = postgres(process.env.DATABASE_URL,{ssl:"require"});


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VIEWS_DIR = path.join(__dirname, "views");
const PARTIALS_DIR = path.join(VIEWS_DIR, "partials");


const app = express();
const PORT = process.env.PORT || 3003;


app.engine("html", engine({ extname: ".html", defaultLayout: false, partialsDir: PARTIALS_DIR }));
app.set("view engine", "html");
app.set("views", VIEWS_DIR);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/public", express.static(path.join(__dirname, "public")));
async function updateStationCoords() {
    const stations = await sql`SELECT id, name FROM stations WHERE latitude IS NULL OR longitude IS NULL`;
    for (const station of stations) {
        const query = encodeURIComponent(station.name + ' station');
        const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;

        try {
            const response = await fetch(url, {
                headers: { "User-Agent": "TSWMap/1.0 (youremail@example.com)" }
            });
            const data = await response.json();

            if (data.length > 0) {
                const { lat, lon } = data[0];
                await sql`
                    UPDATE stations
                    SET latitude = ${parseFloat(lat)}, longitude = ${parseFloat(lon)}
                    WHERE id = ${station.id}
                `;
                console.log(`✅ Updated ${station.name}: (${lat}, ${lon})`);
            } else {
                console.log(`❌ No result for ${station.name}`);
            }
        } catch (err) {
            console.error(`Error updating ${station.name}:`, err);
        }
    }
    console.log("🎉 Geocoding complete.");
    
}
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
            CREATE TABLE IF NOT EXISTS routes (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                code TEXT UNIQUE,
                region TEXT,
                country TEXT,
                operator TEXT,
                length_km REAL,
                game TEXT,
                release_date DATE
            )`;

        await sql`
            CREATE TABLE IF NOT EXISTS stations (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                code TEXT UNIQUE,
                route_id INTEGER REFERENCES routes(id),
                latitude REAL,
                longitude REAL
            )`;

        await sql`
            CREATE TABLE IF NOT EXISTS timetables (
                id SERIAL PRIMARY KEY,
                route_id INTEGER REFERENCES routes(id),
                name TEXT NOT NULL,
                created_by TEXT,
                date_created DATE DEFAULT CURRENT_DATE
            )`;

        await sql`
            CREATE TABLE IF NOT EXISTS trains (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                model TEXT,
                operator TEXT,
                max_speed_kmh INTEGER,
                power_type TEXT,
                year_built INTEGER
            )`;

        await sql`
            CREATE TABLE IF NOT EXISTS services (
                id SERIAL PRIMARY KEY,
                timetable_id INTEGER REFERENCES timetables(id),
                train_id INTEGER REFERENCES trains(id),
                start_station_id INTEGER REFERENCES stations(id),
                end_station_id INTEGER REFERENCES stations(id),
                departure_time TEXT,
                arrival_time TEXT,
                service_type TEXT,
                notes TEXT
            )`;

        await sql`
            CREATE TABLE IF NOT EXISTS platforms (
                id SERIAL PRIMARY KEY,
                station_id INTEGER REFERENCES stations(id),
                platform_number TEXT,
                length_m INTEGER,
                accessible BOOLEAN DEFAULT FALSE
            )`;

        await sql`
            CREATE TABLE IF NOT EXISTS train_events (
                id SERIAL PRIMARY KEY,
                service_id INTEGER REFERENCES services(id),
                station_id INTEGER REFERENCES stations(id),
                event_type TEXT,
                timestamp TEXT,
                notes TEXT
            )`;

        console.log("All TSWDB tables created.");
    } catch (error) {
        console.error("DB setup failed:", error);
    }
}

setupDB();
updateStationCoords();
app.get("/", (req, res) => res.render("index"));
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
app.get("/routes/:id", async (req, res) => {
    const routeId = parseInt(req.params.id);
    try {
        const rows = await sql`
            SELECT * FROM stations
            WHERE route_ids @> ARRAY[${routeId}]::int[]
            ORDER BY id
        `;
        res.render("routemap", { rows });
    } catch (err) {
        console.error("Error loading route map:", err);
        res.status(500).send("Error loading route map");
    }
});
app.post("/add/station",async(req,res)=>{
    const {name,code,route_ids} = req.body;
    const idsArray = route_ids.split(",").map(id=>parseInt(id.trim()));
    try {
        await sql`
            INSERT INTO stations (name, code, route_ids)
            VALUES (${name}, ${code}, ${idsArray})
        `;
        res.redirect("/routes");
    } catch (err) {
        console.error("Error adding station:", err);
        res.status(500).send("Error adding station");
    }
})

if (!process.env.VERCEL && !process.env.NOW_REGION) {
    const PORT = process.env.PORT || 8088;
    app.listen(PORT, () => {
        console.log(`✅ Server running on http://localhost:${PORT}`);
    });
}
export default app;