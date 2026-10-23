<!-- Zenodo badge links to the concept DOI (stable across releases). -->
[![ssec](https://img.shields.io/badge/SSEC-Project-purple?logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA0AAAAOCAQAAABedl5ZAAAACXBIWXMAAAHKAAABygHMtnUxAAAAGXRFWHRTb2Z0d2FyZQB3d3cuaW5rc2NhcGUub3Jnm+48GgAAAMNJREFUGBltwcEqwwEcAOAfc1F2sNsOTqSlNUopSv5jW1YzHHYY/6YtLa1Jy4mbl3Bz8QIeyKM4fMaUxr4vZnEpjWnmLMSYCysxTcddhF25+EvJia5hhCudULAePyRalvUteXIfBgYxJufRuaKuprKsbDjVUrUj40FNQ11PTzEmrCmrevPhRcVQai8m1PRVvOPZgX2JttWYsGhD3atbHWcyUqX4oqDtJkJiJHUYv+R1JbaNHJmP/+Q1HLu2GbNoSm3Ft0+Y1YMdPSTSwQAAAABJRU5ErkJggg==&style=plastic)](https://escience.washington.edu/software-engineering/ssec/)
[![DOI](https://zenodo.org/badge/1016172754.svg)](https://doi.org/10.5281/zenodo.19393410)
[![License](https://img.shields.io/badge/License-BSD%203--Clause-blue.svg)](https://opensource.org/licenses/BSD-3-Clause)

# RDS App: Contra Costa County, CA

The `contra-costa-ca` branch holds the Contra Costa County deployment of the RDS App. It was branched from `main` via the Grant County (`grant-county-wa`) and LA County (`la-county-ca`) site branches, and carries Contra Costa's own survey and settings. Shared fixes land on `main` and are merged into this branch.

**What is specific to Contra Costa**

- Survey questions from the 2026 Youth Housing Survey (`client/src/pages/Survey/utils/survey.json`). Partner agency and city names are still marked TODO in the survey.
- Hub sites: the four libraries on the coupon (Brentwood, San Pablo, Concord, Pittsburg) in `server/src/scripts/locations.yaml`. Load them into a database with `npm run location -- import src/scripts/locations.yaml` (or `location:test` for the test database).
- Production hostname setting in `client/src/utils/environment.ts`.
- Coupon template `server/src/scripts/coupon-templates/contra-costa-ca.yaml`, selected with `COUPON_TEMPLATE=contra-costa-ca`. It uses Contra Costa Health's designed coupon (`contra-costa-ca.pdf`) with the four library hub sites. That PDF is not in git because it holds a live Uber ride-voucher QR code; copy it into `server/src/scripts/coupon-templates/` from the project's files before generating coupons. Each seed's QR code goes in the large "Your survey coupon code" box; the Uber QR in the "Transportation only" panel is for rides.
- Seed agencies: `server/src/scripts/seed-agencies.yaml` lists the agencies that hand out seed coupons, each with its city and survey site (from the "Seed Sites" sheet of Contra Costa Health's workbook). `npm run generate-seeds -- --agency "RYSE" 10` makes 10 seeds at that agency's site, saves the agency name and location on each seed, and prints "Seed coupon for: RYSE (Richmond) · Survey site: San Pablo Library" across the top of each coupon. `--all-agencies 10` makes 10 for every agency, one PDF each. An agency at two sites needs `--agency-location`.

**Not yet set up**

- A deployment workflow for Contra Costa. The Azure deploy workflows in `.github/workflows/` only run on pushes to the King County branch (`kc-pit-2026`), so pushes to this branch deploy nothing.

**Data and credentials stay out of this branch.** Never commit `.env` files, database exports, participant data, coupon codes or phone numbers. Use `server/.env.example` as the template for local settings and get real values from a project maintainer.

The rest of this README is the base app's documentation.

## Overview

> **Documentation:** [MKDocs GitHub Site](https://ssdalab.github.io/respondent-driven-sampling/)

The RDS App is an open-source web application for conducting **Respondent-Driven Sampling (RDS)** surveys of unsheltered populations. Developed in collaboration with the University of Washington  County Regional Homelessness Authority (KCRHA), the app enables volunteers and administrators to collect survey data, track referral chains, and develop population estimates for Point-in-Time (PIT) counts.

The codebase is a TypeScript monorepo: React frontend (`client/`), Node.js/Express backend (`server/`), and MongoDB for data storage. Authentication is handled via Twilio Verify (OTP). The present deployment is through Azure App Service.

## Local Development

1. **Clone the repo**

```bash
git clone https://github.com/SSDALab/respondent-driven-sampling.git
cd respondent-driven-sampling
```

2. **Set environment variables**

   Copy the template to create your local env file:

   ```bash
   cp server/.env.example server/.env
   ```

   Open `server/.env` and fill in your values:

   ```dotenv
   NODE_ENV=development
   MONGO_URI=mongodb+srv://YOUR_USER:YOUR_PASSWORD@YOUR_CLUSTER.mongodb.net/
   MONGO_DB_NAME=rds-your-db-name
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_twilio_auth_token
   TWILIO_VERIFY_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_PHONE_NUMBER=+12065551234
   AUTH_SECRET=paste_output_of_openssl_rand_-hex_32
   TIMEZONE=America/Los_Angeles
   ```

   > **Where do I get these values?**
   > These credentials are **not** included in the repository. Contact a project maintainer to obtain shared development values, or set up your own [MongoDB Atlas](https://www.mongodb.com/atlas) and [Twilio](https://console.twilio.com) accounts. Generate `AUTH_SECRET` locally with `openssl rand -hex 32`. See the full [Environment Variables](https://ssdlab.github.io/respondent-driven-sampling/reference/environment-variables/) reference for details on each variable.

   **Important:** The file must be `server/.env` (next to `server/package.json`), not inside `server/src/` or the repository root.

3. **Install packages**

```bash
cd client && npm install
cd ../server && npm install
```

4. **Start the backend server** (with hot reload)

```bash
cd server
npm run dev
```

   For production-style run: `npm run build` then `npm start`.

5. **Start the frontend dev server** (in a separate terminal)

```bash
cd client
npm run dev
```

6. **Visit the app** at [http://localhost:3000](http://localhost:3000).

The login page will load, but authentication requires the database to be initialised with locations, a super admin account, and seeds. See [Getting Started](https://ssdlab.github.io/respondent-driven-sampling/getting-started/getting-started/) for the full setup walkthrough.

## Future Directions

The following features have been identified as high-priority candidates for future development:

**App Features**

- Auto-populate location from last survey entry
- Widget for staff to comment on survey responses
- Integration with Homeless Management Information System (HMIS)
- Volunteer scheduling dashboard for administrators
- Resume unfinished survey feature
- Admin ability to edit survey questions
- Volunteer ability to edit survey responses
- Survey analytics dashboard

**Testing**

- Dynamic Application Security Testing (DAST)

## Funding Support

This project is supported by:

- NSF CAREER Grant [#SES-2142964](https://www.nsf.gov/awardsearch/showAward?AWD_ID=2142964) to Zack Almquist (PI)
- UW Population Health Grant Tier 3

## Citation

If you use this software, please cite it via the **"Cite this repository"** button on GitHub or see [`CITATION.cff`](CITATION.cff). Zenodo concept DOI: [https://doi.org/10.5281/zenodo.19393410](https://doi.org/10.5281/zenodo.19393410).

## Funding Support
- This project is supported by 
    - NSF CAREER GRANT #SES-2142964 to Zack Almquist (PI)
    - UW Population Health Grant Tier 3
  
## Contributors
[![Contributors](https://contrib.rocks/image?repo=SSDALab/respondent-driven-sampling)](https://github.com/SSDALab/respondent-driven-sampling/graphs/contributors)
