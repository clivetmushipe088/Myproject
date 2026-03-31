# NutriSearch — Nutritional Food Search & Dietary Planning Tool

**Author:** Clive Tanaka Mushipe  
**Course:** ALU Back-End Engineering  
**Year:** 2026

---

## What is NutriSearch?

NutriSearch is a dietary planning tool that lets users search a massive food database and instantly compare the nutritional content of food items. Users can filter results by dietary goals (high protein, low calorie, low carb) and sort by any macro, making it genuinely useful for anyone tracking their nutrition.

**Why this is not a food menu app:** The core value is data interaction — filtering and sorting nutritional data to support real dietary decisions, not browsing a list of foods.

---

## Features

- **Keyword search** — search any food from the Open Food Facts database (3M+ products)
- **Suggestion pills** — 10 quick-start common foods to get started immediately
- **Sort** — by calories (asc/desc), protein (highest first), carbs (lowest first)
- **Filter** — All | High Protein (>20g) | Low Calorie (<150 kcal) | Low Carb (<10g) | High Calorie (>300 kcal)
- **Pagination** — load more results page by page
- **Error handling** — specific messages for network failures, API downtime, empty results, and no filter matches

---

## External API

**Open Food Facts**  
Website: https://world.openfoodfacts.org/  
Documentation: https://openfoodfacts.github.io/openfoodfacts-server/api/  
Endpoint: `GET https://world.openfoodfacts.org/cgi/search.pl`  
API Key: **None required** — Open Food Facts is a free, open-source, collaborative food database (the Wikipedia of food). It allows direct browser requests with no authentication.

Choosing a keyless API was a deliberate decision — it means there is no sensitive information to handle or expose, satisfying the security requirement by design.

---

## Project Structure

```
nutrisearch/
├── index.html   — HTML markup and page structure
├── style.css    — All styles, CSS variables, animations
├── app.js       — API calls, sort/filter logic, DOM rendering
└── README.md    — This file
```
## DEMP VIDEO

https://drive.google.com/file/d/1bQPFvoE8C6KqPeY7wR7rKUjqnENRST9M/view?usp=sharing
---

## Part One: Running Locally

No build step or server required. Runs as plain static files.

1. Clone the repo:
   ```bash
   git clone <your-repo-url>
   cd nutrisearch
   ```

2. Open `index.html` directly in your browser — double-click it in Finder or File Explorer.

3. Search for any food and use the sort/filter controls to interact with results.

---

## Part Two: Deployment

### Prerequisites on each server
- Ubuntu server (web01, web02, lb01)
- nginx: `sudo apt update && sudo apt install nginx -y`

---

### Step 1 — Deploy to web01

**From your local machine:**
```bash
scp index.html style.css app.js ubuntu@<WEB01_IP>:~/
```

**SSH into web01:**
```bash
ssh ubuntu@<WEB01_IP>
```

**Move files into the nginx web root:**
```bash
sudo mkdir -p /var/www/nutrisearch
sudo mv ~/index.html ~/style.css ~/app.js /var/www/nutrisearch/
sudo chown -R www-data:www-data /var/www/nutrisearch
```

**Create the nginx site config:**
```bash
sudo nano /etc/nginx/sites-available/nutrisearch
```

Paste this:
```nginx
server {
    listen 80;
    server_name _;

    root /var/www/nutrisearch;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Enable and reload:**
```bash
sudo ln -s /etc/nginx/sites-available/nutrisearch /etc/nginx/sites-enabled/nutrisearch
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

**Test:** `http://<WEB01_IP>` should load the app.

---

### Step 2 — Deploy to web02

Repeat every step from Step 1, replacing `WEB01_IP` with `WEB02_IP`.

---

### Step 3 — Configure the Load Balancer (lb01)

**SSH into lb01:**
```bash
ssh ubuntu@<LB01_IP>
```

**Create the load balancer config:**
```bash
sudo nano /etc/nginx/sites-available/nutrisearch-lb
```

Paste this (replace the IPs):
```nginx
upstream nutrisearch_backend {
    server <WEB01_IP>:80;
    server <WEB02_IP>:80;
}

server {
    listen 80;
    server_name _;

    location / {
        proxy_pass         http://nutrisearch_backend;
        proxy_set_header   Host             $host;
        proxy_set_header   X-Real-IP        $remote_addr;
        proxy_set_header   X-Forwarded-For  $proxy_add_x_forwarded_for;
    }
}
```

**Enable and reload:**
```bash
sudo ln -s /etc/nginx/sites-available/nutrisearch-lb /etc/nginx/sites-enabled/nutrisearch-lb
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

**Test:** Open `http://<LB01_IP>` — the app loads, and traffic round-robins between web01 and web02.

---

### Verifying load balancing

On both servers simultaneously, watch the access logs while clicking around in the browser:

```bash
# web01
sudo tail -f /var/log/nginx/access.log

# web02 (separate terminal)
sudo tail -f /var/log/nginx/access.log
```

Refreshing the browser several times should show requests appearing on both servers alternately.

---

## Challenges & Solutions

**MyFitnessPal API returned empty results on the free tier**  
I initially used the MyFitnessPal API via RapidAPI. After confirming the API key was valid and requests were hitting the server (rate limit counter was decreasing), the response kept returning an empty array. This is a known limitation of the BASIC (free) tier — it doesn't actually return food data. I switched to Open Food Facts, which is a better-fit API for this use case: larger database (3M+ products), fully open, CORS-enabled, and no key required.

**Inconsistent nutritional field names across products**  
Open Food Facts stores energy as `energy-kcal_100g`, `energy-kcal`, or `energy_100g` (in kJ) depending on who submitted the product. I wrote a `normalise()` function that checks all three and converts kJ to kcal where needed.

**"Food menu app" concern**  
The brief explicitly excludes food menu apps. NutriSearch differentiates itself through the sort and filter layer — the value is comparing macro profiles across multiple foods to support dietary decisions, not browsing a restaurant menu.

---

## Credits & Resources

| Resource | URL |
|----------|-----|
| Open Food Facts API | https://world.openfoodfacts.org/ |
| Open Food Facts API Docs | https://openfoodfacts.github.io/openfoodfacts-server/api/ |
| Syne font — Google Fonts | https://fonts.google.com/specimen/Syne |
| DM Mono font — Google Fonts | https://fonts.google.com/specimen/DM+Mono |
| nginx documentation | https://nginx.org/en/docs/ |
| MDN — Fetch API | https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API |
