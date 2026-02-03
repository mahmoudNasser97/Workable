const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const account = process.env.WORKABLE_ACCOUNT;
const apiKey = process.env.WORKABLE_API_KEY;

// Root
app.get("/", (req, res) => {
  res.send("Backend is running");
});

// ==============================
// Get ALL jobs (open + closed + archived)
// ==============================
app.get("/jobs", async (req, res) => {
  try {
    const limit = 50;
    let page = 1;
    let allJobs = [];

    while (true) {
      const response = await axios.get(
        `https://${account}.workable.com/spi/v3/jobs`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          params: {
            state: "open,closed,archived",
            limit,
            page,
          },
        }
      );

      const jobs = response.data.jobs || [];

      if (jobs.length === 0) break;

      allJobs.push(
        ...jobs.map(job => ({
          id: job.id,
          title: job.title,
          state: job.state,
        }))
      );

      if (jobs.length < limit) break;

      page++;

      // Optional: prevent rate-limit issues
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    res.json({ jobs: allJobs });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({
      error: err.response?.data || err.message,
    });
  }
});

// ==============================
// Add candidate to a job
// ==============================
app.post("/add-candidate", async (req, res) => {
  const { firstName, lastName, email, linkedin_url, tag, jobId } = req.body;

  if (!firstName || !lastName || !jobId) {
    return res.status(400).json({
      error: "firstName, lastName, and jobId are required",
    });
  }

  try {
    const response = await axios.post(
      `https://${account}.workable.com/spi/v3/jobs/${jobId}/candidates`,
      {
        first_name: firstName,
        last_name: lastName,
        email: email || undefined,
        linkedin_url: linkedin_url || undefined,
        source: "Sourced",
        tags: tag ? [tag] : [],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    res.json({
      success: true,
      data: response.data,
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({
      error: err.response?.data || { message: err.message },
    });
  }
});

// ==============================
// Start server
// ==============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});