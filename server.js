const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ===== Helper: Check duplicate by email or LinkedIn URL =====
async function isDuplicate(jobId, email, linkedin_url, apiKey, account) {
  try {
    const res = await axios.get(
      `https://${account}.workable.com/spi/v3/jobs/${jobId}/candidates`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    const candidates = res.data.candidates || [];
    return candidates.some(c =>
      (email && c.email === email) || (linkedin_url && c.linkedin_url === linkedin_url)
    );
  } catch (err) {
    console.error("Duplicate check failed:", err.message);
    return false;
  }
}

// ===== ROUTES =====

// Root
app.get("/", (req, res) => {
  res.send("Backend is running");
});

// Fetch all jobs (active + inactive)
app.get("/jobs", async (req, res) => {
  try {
    const account = process.env.WORKABLE_ACCOUNT;
    const apiKey = process.env.WORKABLE_API_KEY;

    const response = await axios.get(
      `https://${account}.workable.com/spi/v3/jobs`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    res.json({ jobs: response.data.jobs || [] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

// Add candidate (POST)
app.post("/add-candidate", async (req, res) => {
  try {
    const { firstName, lastName, email, linkedin_url, tag, jobId } = req.body;

    if (!firstName || !lastName || !jobId) {
      return res.status(400).json({ error: "firstName, lastName, and jobId are required" });
    }

    const account = process.env.WORKABLE_ACCOUNT;
    const apiKey = process.env.WORKABLE_API_KEY;

    // Duplicate check
    const duplicate = await isDuplicate(jobId, email, linkedin_url, apiKey, account);
    if (duplicate) return res.status(400).json({ error: "Candidate already exists" });

    const response = await axios.post(
      `https://${account}.workable.com/spi/v3/jobs/${jobId}/candidates`,
      {
        first_name: firstName,
        last_name: lastName,
        email: email || undefined,
        linkedin_url: linkedin_url || undefined,
        source: "Sourced",
        tags: tag ? [tag] : []
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));