const express = require('express');
const fetch = require('node-fetch'); // We need node-fetch for server-side fetching
const path = require('path'); // For path resolution
const app = express();
const PORT = process.env.PORT || 10000; // Render provides the PORT environment variable

// Define the adblock source URLs
const ADBLOCK_SOURCES = [
    "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
    "https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/fakenews-gambling-social/hosts",
    "https://raw.githubusercontent.com/yous/YousList/master/hosts.txt",
    "https://raw.githubusercontent.com/FadeMind/hosts.extras/master/SpotifyAds/hosts",
    "https://raw.githubusercontent.com/azet12/KADhosts/master/KADhosts.txt",
    "https://raw.githubusercontent.com/mitchellkrogza/Badd-Boyz-Hosts/master/hosts",
    "https://adaway.org/hosts.txt",
    "https://pgl.yoyo.org/as/serverlist.php?hostformat=hosts&showintro=0&mimetype=plaintext",
    "http://winhelp2002.mvps.org/hosts.txt",
    "http://hostsfile.org/Downloads/hosts.txt",
    "http://someonewhocares.org/hosts/zero/hosts",
    "http://sysctl.org/cameleon/hosts",
    "http://adblock.mahakala.is",
    "http://www.montanamenagerie.org/hostsfile/hosts.txt",
    "http://securemecca.com/Downloads/hosts.txt",
    "https://phishing.army/download/phishing_army_blocklist.txt",
    "https://www.github.developerdan.com/hosts/lists/ads-and-tracking-extended.txt",
    "https://www.github.developerdan.com/hosts/lists/amp-hosts-extended.txt",
    "https://www.github.developerdan.com/hosts/lists/facebook-extended.txt",
    "https://big.oisd.nl/",
    "https://nsfw.oisd.nl/",
    "https://someonewhocares.org/hosts/zero/",
    "https://someonewhocares.org/hosts/ipv6zero/",
    "https://notracking.cloned.guru/hosts.txt",
    "https://raw.githubusercontent.com/DandelionSprout/adfilt/master/PhonePrivacy/blocklist",
    "https://raw.githubusercontent.com/PolishFiltersTeam/KADhosts/master/KADhosts.txt",
    "https://raw.githubusercontent.com/Perflyst/PiHoleBlocklist/master/android-tracking.txt",
    "https://raw.githubusercontent.com/Perflyst/PiHoleBlocklist/master/SmartTV.txt",
    "https://raw.githubusercontent.com/jerryn70/GoodbyeAds/master/Hosts/GoodbyeAds.txt",
    "https://raw.githubusercontent.com/jerryn70/GoodbyeAds/master/Hosts/GoodbyeAdsSamsung.txt",
    "https://raw.githubusercontent.com/jerryn70/GoodbyeAds/master/Hosts/GoodbyeAdsTV.txt",
    "https://raw.githubusercontent.com/VeleSila/yhosts/master/hosts",
    "https://raw.githubusercontent.com/ShadowWhisperer/BlockLists/master/Lists/ads-and-tracking-extended.txt",
    "https://raw.githubusercontent.com/crazy-max/WindowsSpyBlocker/master/data/hosts/spy.txt",
    "https://raw.githubusercontent.com/RooneyMcNibNug/pihole-stuff/master/SNAFU.txt",
    "https://raw.githubusercontent.com/hl2guide/Filterlist-for-AdGuard/master/filter.txt",
    "https://raw.githubusercontent.com/ookangzheng/blahdns/master/hosts",
    "https://raw.githubusercontent.com/anudeepND/blacklist/master/adservers.txt",
    "https://raw.githubusercontent.com/Akamaru/Pi-Hole-Lists/master/adobe.txt",
    "https://raw.githubusercontent.com/hoshsadiq/adblock-nocoin-list/master/nocoin.txt",
    "https://raw.githubusercontent.com/nextdns/click-tracking-blocklist/master/domains",
    "https://raw.githubusercontent.com/nickspaargaren/no-google/master/pihole-google.txt",
];

// In-memory cache for the merged adblock list
let cachedAdblockData = {
    list: '',
    timestamp: 0,
    totalEntries: 0
};
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (adjust as needed)

// Static localhost entries to always include
const LOCALHOST_ENTRIES = `
# --------------------------------------------
# L O C A L  H O S T
# --------------------------------------------
127.0.0.1 localhost
127.0.0.1 localhost.localdomain
127.0.0.1 local
255.255.255.255 broadcasthost
::1 localhost
::1 ip6-localhost
::1 ip6-loopback
fe80::1%lo0 localhost
ff00::0 ip6-localnet
ff00::0 ip6-mcastprefix
ff02::1 ip6-allnodes
ff02::2 ip6-allrouters
ff02::3 ip6-allhosts
0.0.0.0 0.0.0.0
`;

// Function to fetch, merge, and deduplicate adblock lists
async function generateAdblockList() {
    console.log("Re-fetching and merging adblock lists...");
    let uniqueDomains = new Set(); // Use a Set for automatic deduplication of domains

    for (const url of ADBLOCK_SOURCES) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
                continue; // Skip this URL and try the next one
            }
            const text = await response.text();
            text.split('\n').forEach(line => {
                const trimmedLine = line.trim();
                // Basic filtering and normalization for hosts/adblock formats
                if (trimmedLine &&
                    !trimmedLine.startsWith('!') && // Adblock Plus comments
                    !trimmedLine.startsWith('#') && // General comments
                    !trimmedLine.startsWith('[') // Section headers like [Adblock Plus 2.0]
                ) {
                    // Handle hosts file format (e.g., "0.0.0.0 example.com" or "127.0.0.1 example.com")
                    const parts = trimmedLine.split(/\s+/);
                    if (parts.length > 1 && (parts[0] === '0.0.0.0' || parts[0] === '127.0.0.1' || parts[0] === '::1')) {
                        // Extract only the domain part if it's not a localhost entry
                        const domain = parts[1];
                        if (domain && !domain.startsWith('#') && !domain.includes('localhost') && !domain.includes('0.0.0.0') && !domain.includes('::1')) {
                             uniqueDomains.add(domain);
                        }
                    } else if (parts.length === 1) {
                        // Assume it's a direct domain entry or a simple filter rule
                        // Filter out common localhost/IPv4/IPv6 entries that are covered by our static list
                        if (!trimmedLine.includes('localhost') && !trimmedLine.includes('0.0.0.0') && !trimmedLine.includes('::1')) {
                            uniqueDomains.add(trimmedLine);
                        }
                    }
                }
            });
        } catch (error) {
            console.error(`Error fetching or processing ${url}:`, error);
        }
    }

    // Sort the unique domains alphabetically
    const sortedDomains = Array.from(uniqueDomains).sort();
    const totalEntries = sortedDomains.length;

    // Get current date and time for the header
    const lastUpdated = new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true, // 12-hour format
        timeZoneName: 'short',
    });


    // Construct the custom header
    const customHeader = `
# --------------------------------------------
#          ◆ R A A H I M   A D B L O C K◆
# --------------------------------------------
#
#
# --------------------------------------------
# P A C K  D E T A I L S
# --------------------------------------------
# Title: Raahim Adblock Ultimate
# Description: Blocks Ads. Trackers. Analytics. Malware.
# Format: hosts
# Version: V1.00
# Entries: ${totalEntries}
# License: Open-Source
# Updated: ${lastUpdated}

# Developer & Maintainer: Raahim (Personal Project)

# --------------------------------------------
#`;

    // Combine header, localhost entries, and sorted domains
    const finalAdblockContent = [
        customHeader.trim(), // Trim leading/trailing newlines from template literal
        LOCALHOST_ENTRIES.trim(), // Trim for clean concatenation
        `# --------------------------------------------`, // Separator
        `# U L T I M A T E - A D B L O C K- B E G A I N S`,
        `# --------------------------------------------`,
        ...sortedDomains,
    ].join('\n');

    return { list: finalAdblockContent, totalEntries: totalEntries };
}

// Middleware to set CORS headers for all responses
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Max-Age", "86400"); // Cache preflight for 24 hours
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204); // Handle preflight requests
    }
    next();
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Adblock list endpoint
app.get('/adblock.txt', async (req, res) => {
    const now = Date.now();

    // Check if cached data is fresh
    if (cachedAdblockData.list && (now - cachedAdblockData.timestamp < CACHE_TTL_MS)) {
        console.log("Serving cached adblock list from in-memory cache.");
        res.type('text/plain').send(cachedAdblockData.list);
    } else {
        // Cache stale or empty: generate new list
        const { list, totalEntries } = await generateAdblockList();
        cachedAdblockData = { list, totalEntries, timestamp: now };
        res.type('text/plain').send(list);
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Raahim Adblock Render service running on port ${PORT}`);
});
