require("dotenv").config();
const express    = require("express");
const cors       = require("cors");
const bodyParser = require("body-parser");
const mysql      = require("mysql2");
const path       = require("path");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || "localhost",
  user:               process.env.DB_USER     || "root",
  password:           process.env.DB_PASSWORD || "",
  database:           process.env.DB_NAME     || "terraweather",
  port:               process.env.DB_PORT     || 3306,
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0
});
const db = pool.promise();

async function initDB() {
  try {
    await db.query("SELECT 1");
    console.log("Connected to MySQL successfully!");
    await db.query(`CREATE TABLE IF NOT EXISTS searches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      city VARCHAR(100) NOT NULL,
      temp FLOAT,
      description VARCHAR(200),
      searched_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS favorites (
      id INT AUTO_INCREMENT PRIMARY KEY,
      city VARCHAR(100) UNIQUE NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log("Tables ready.");
  } catch (err) {
    console.error("MySQL Error:", err.message);
    process.exit(1);
  }
}

app.get("/api/searches", async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT city, temp, description, MAX(searched_at) AS searched_at FROM searches GROUP BY city ORDER BY searched_at DESC LIMIT 20`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/searches", async (req, res) => {
  const { city, temp, description } = req.body;
  if (!city) return res.status(400).json({ error: "City required." });
  try {
    const [result] = await db.query("INSERT INTO searches (city, temp, description) VALUES (?, ?, ?)", [city, temp ?? null, description ?? null]);
    res.json({ id: result.insertId, city, temp, description });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/searches", async (req, res) => {
  try { await db.query("DELETE FROM searches"); res.json({ message: "History cleared." }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/favorites", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM favorites ORDER BY added_at DESC");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/favorites", async (req, res) => {
  const { city } = req.body;
  if (!city) return res.status(400).json({ error: "City required." });
  try {
    const [result] = await db.query("INSERT IGNORE INTO favorites (city) VALUES (?)", [city]);
    res.json({ id: result.insertId, city });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/favorites/:city", async (req, res) => {
  try {
    await db.query("DELETE FROM favorites WHERE city = ?", [req.params.city]);
    res.json({ deleted: req.params.city });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/stats", async (req, res) => {
  try {
    const [[countRow]] = await db.query("SELECT COUNT(*) AS total FROM searches");
    const [[topRow]]   = await db.query("SELECT city FROM searches GROUP BY city ORDER BY COUNT(*) DESC LIMIT 1");
    res.json({ total: countRow.total, top_city: topRow?.city || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log("TerraWeather v3 running at http://localhost:" + PORT);
  });
});
