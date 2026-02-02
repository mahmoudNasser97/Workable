const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Backend is running");
});

app.get("/jobs", async (req, res) => {
  try {
    const account = process.env.WORKABLE_ACCOUNT;
    const apiKey = process.env.WORKABLE_API_KEY;

    const response = await axios.get(
      `https://${account}.workable.com/spi/v3/jobs`,
      {
        headers: { Authorization: `Bearer ${apiKey}` }
      }
    );

    res.json(response.data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/add-candidate", async (req, res) => {
  try {
    const { firstName, lastName, email, linkedin_url, tag, jobId } = req.body;

    const response = await axios.post(
      `https://${process.env.WORKABLE_ACCOUNT}.workable.com/spi/v3/jobs/${jobId}/candidates`,
      {
        first_name: firstName,
        last_name: lastName,
        email,
        linkedin_url,
        source: "Sourced",
        tags: tag ? [tag] : []
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WORKABLE_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json({ success: true, data: response.data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));