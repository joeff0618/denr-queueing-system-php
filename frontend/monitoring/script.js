const API_BASE = "../api/queue";

/* ================= STATE ================= */

let allData = [];          // Raw data from server
let filteredData = [];     // After filters applied
let currentPage = 1;
let rowsPerPage = 6;
let sortKey = "created_at";
let sortDirection = "desc"; // "asc" or "desc"
let userDivision = localStorage.getItem("userDiv");   // Get assigned division

/** Checks if a queue item's division matches the logged-in operator's division. */
function matchesDivision(itemDiv) {
    if (!itemDiv) return false;
    const lowerItemDiv = itemDiv.toLowerCase();
    const lowerUserDiv = (userDivision || "").toLowerCase();
    
    if (lowerUserDiv === 'smd') {
        return lowerItemDiv === 'smd' || lowerItemDiv === 'r-smd' || lowerItemDiv === 'sr-smd';
    }
    return lowerItemDiv === lowerUserDiv;
}

let selectedEntryId = null;
let currentEntryId = null;
let currentQueueNumber = null;
let knownForwardedIds = null;

/** Plays a chime audio sound. */
function playChime() {
    try {
        const audio = new Audio('../assets/sound/freesound_community-chime-sound-7143.mp3');
        audio.play().catch(err => console.warn("Failed to play audio:", err));
    } catch (e) {
        console.error("Audio error:", e);
    }
}

/** Updates the division indicator badge on the operator interface. */
function updateDivisionBadge() {
    const divBadge = document.getElementById("divisionBadge");
    if (divBadge) {
        if (userDivision) {
            divBadge.textContent = userDivision.toUpperCase();
            divBadge.className = `div-badge ${userDivision.toLowerCase()}`;
            divBadge.style.display = "inline-flex";
        } else {
            divBadge.style.display = "none";
        }
    }
}

(async function() {                                                                                                           
            try {                                                                                                                     
                const response = await fetch("../api/auth/profile");                                                                    
                if (!response.ok) {                                                                                                   
                    // If unauthorized (e.g. 401), redirect back to login                                                             
                    window.location.replace("../login/auth.html");                                                                      
                    return;                                                                                                           
                }                                                                                                                     
                const data = await response.json();                                                                                   
                                                                                                                                      
                // Check if the user is an operator (division: lobby)                                                               
                if (data.division === "lobby" || data.division === "sadmin") {                                                                                    
                    // Redirect them to their designated operator page
                    window.location.replace("../operator/index.html");
                    return;
                }                                                                                                                     
                                                                                                                                      
                if (data.division) {
                    userDivision = data.division.toLowerCase();
                    updateDivisionBadge();
                }
 
                // If they are authorized, make the page contents visible                                                             
                document.documentElement.style.display = "block";                                                                     
            } catch (e) {                                                                                                             
                window.location.replace("../login/auth.html");                                                                          
            }
        })();

/* ================= INITIAL LOAD ================= */

document.addEventListener("DOMContentLoaded", () => {
    updateDivisionBadge();
    loadAllData();
    // Deselect when clicking outside of rows or controls
    document.addEventListener('click', (e) => {
        // If click is inside a table row, a queue number button, or any form/control element, keep selection
        if (e.target.closest('tr[data-entry-id]') || e.target.closest('.queue-number') || e.target.closest('button') 
            || e.target.closest('input') || e.target.closest('textarea') || e.target.closest('select') 
            || e.target.closest('label')) {
            return;
        }

        // Otherwise clear selection
        selectRow(null, null);
    });
    // Deselect when clicking outside of rows or controls
    document.addEventListener('click', (e) => {
        // If click is inside a table row, a queue number button, or any form/control element, keep selection
        if (e.target.closest('tr[data-entry-id]') || e.target.closest('.queue-number') || e.target.closest('button') 
            || e.target.closest('input') || e.target.closest('textarea') || e.target.closest('select') 
            || e.target.closest('label')) {
            return;
        }

        // Otherwise clear selection
        selectRow(null, null);
    });
});

/* ================= DATA FETCHING ================= */

/** Fetches queue items from the server and filters them by division. */
async function loadAllData(resetPage = true) {
    try {
        const todayOnly = document.getElementById("todayOnly").checked;
        const url = todayOnly ? `${API_BASE}/today` : `${API_BASE}/all`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
            throw new Error("Queue API returned an unexpected response.");
        }

        // Filter based on division
        const filteredData = data.filter(
            item => matchesDivision(item.division)
        );

        allData = filteredData;
        updateMonitoringDashboard();
        updateStats();
        updateLastUpdated();
        if (resetPage) currentPage = 1;
        applyFilters(resetPage);

    } catch (error) {
        console.error("Error loading data:", error);
        renderLoadError("Failed to load queue data. Check that the backend server is running.");
        updateLastUpdated("Unable to sync");
    }
}

/** Updates the dashboard panel listing items forwarded to this division. Handles chime and TTS announcements. */
function updateMonitoringDashboard() {
    const items = allData.filter(
        item =>
            item.status.toLowerCase() === "forwarded" &&
            matchesDivision(item.division)
    );

    if (knownForwardedIds !== null) {
        let newItem = null;
        items.forEach(item => {
            if (!knownForwardedIds.has(item.id)) {
                newItem = item;
            }
        });
        if (newItem) {
            playChime();
            
            const modal = document.getElementById("forwardedAnnouncementModal");
            const qnoEl = document.getElementById("announcementQno");
            const purposeEl = document.getElementById("announcementPurpose");
            const divisionEl = document.getElementById("announcementDivision");
            
            const divisionName = newItem.division ? newItem.division.toUpperCase() : "GENERAL";
            
            if (modal && qnoEl && purposeEl) {
                qnoEl.textContent = newItem.queue_no;
                purposeEl.textContent = newItem.purpose;
                if (divisionEl) {
                    divisionEl.textContent = divisionName;
                }
                modal.style.display = "flex";
            }
            
            // Format division pronunciation for acronyms/codes
            let spokenDivision = divisionName;
            if (['SMD', 'R-SMD', 'SR-SMD', 'LPDD', 'PMD', 'RSCIG'].includes(divisionName)) {
                spokenDivision = divisionName.replace('-', ' ').split('').join(' ');
            } else if (divisionName === 'A0504') {
                spokenDivision = 'A 0 5 0 4';
            }
            
            const speechText = `Number ${newItem.queue_no} is forwarded to ${spokenDivision}, please attend to the client immediately. Purpose: ${newItem.purpose}.`;
            const utterance = new SpeechSynthesisUtterance(speechText);
            utterance.rate = 0.9;
            
            // Play TTS after the chime has completed (approx 1.5 seconds)
            setTimeout(() => {
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(utterance);
            }, 1500);
        }
    }
    knownForwardedIds = new Set(items.map(item => item.id));

    const display = document.getElementById("numberDisplay");
    const completeBtn = document.getElementById("completeBtn");
    const returnBtn = document.getElementById("returnBtn");

    if (!display) return;

    display.innerHTML = `<div class="number-grid"></div>`;
    const grid = display.querySelector(".number-grid");

    if (items.length === 0) {
        selectedEntryId = null;
        currentQueueNumber = null;

        grid.innerHTML = `
            <div style="
                grid-column: 1 / -1;
                text-align: center;
                color: #888;
                font-weight: 700;
                padding: 20px;
            ">
                None Forwarded
            </div>
        `;

        completeBtn.disabled = true;
        returnBtn.disabled = true;
        return;
    }

    items.forEach(item => {
        const btn = document.createElement("button");

        btn.className = "queue-number";
        btn.textContent = String(item.queue_no);
        btn.dataset.entryId = item.id;

        if (item.id === selectedEntryId) {
            btn.classList.add("active");
        }

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            // Clicking the selected button deselects it
            if (selectedEntryId === item.id) {
                selectedEntryId = null;
                currentQueueNumber = null;

                document.getElementById("completeBtn").disabled = true;
                document.getElementById("returnBtn").disabled = true;
                btn.classList.remove("active");
            } else {
                selectedEntryId = item.id;
                currentQueueNumber = item.queue_no;

                document.querySelectorAll(".queue-number").forEach(b => b.classList.remove("active"));
                document.getElementById("completeBtn").disabled = false;
                document.getElementById("returnBtn").disabled = false;
                btn.classList.add("active");
            }

            // Keep the table selection in sync with the number-grid selection
            renderTable();
        });

        grid.appendChild(btn);
    });
}

/* ================= TODAY TOGGLE ================= */

/** Refreshes queue data when the Today Only filter is toggled. */
function onTodayToggle() {
    loadAllData();
}

/* ================= FILTERING ================= */

/** Applies text search, priority, and status filters to the queue list. */
function applyFilters(resetPage = true) {
    const search = document.getElementById("searchInput").value.toLowerCase();
    const priority = document.getElementById("priorityFilter").value;
    const status = document.getElementById("statusFilter").value.toLowerCase();

    filteredData = allData.filter(item => {
        // Search filter
        const text = `${item.client_name} ${item.purpose} ${item.queue_no} ${item.id}`.toLowerCase();
        if (search && !text.includes(search)) return false;

        // Priority filter
        if (priority !== "") {
            const isPriority = priority === "true";
            const itemIsPriority = item.priority !== "regular";
            if (itemIsPriority !== isPriority) return false;
        }

        // Status filter
        if (status && item.status.toLowerCase() !== status) return false;

        return true;
    });

    // Apply current sort
    applySorting(resetPage);
}

/* ================= SORTING ================= */

/** Triggers sorting of the filtered queue data by a specific field key. */
function sortBy(key) {
    if (sortKey === key) {
        // Toggle direction
        sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
        sortKey = key;
        sortDirection = "asc";
    }

    updateSortIcons();
    applySorting();
}

/** Sorts the queue data array using the active sort key and direction. */
function applySorting(resetPage = true) {
    filteredData.sort((a, b) => {
        const statusPriority = {
            forwarded: 1,
            processing: 2,
            pending: 3,
            completed: 4,
            deferred: 4
        };
        
        const priorityA = statusPriority[(a.status || "").toLowerCase()] ?? 999;
        const priorityB = statusPriority[(b.status || "").toLowerCase()] ?? 999;

        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }        
        
        let valA, valB;

        if (sortKey === "service_time") {
            valA = computeServiceTimeMs(a);
            valB = computeServiceTimeMs(b);
        } else if (sortKey === "created_at" || sortKey === "completed_at") {
            valA = a[sortKey] ? new Date(a[sortKey]).getTime() : 0;
            valB = b[sortKey] ? new Date(b[sortKey]).getTime() : 0;
        } else if (sortKey === "priority") {
            valA = a.priority !== "regular" ? 1 : 0;
            valB = b.priority !== "regular" ? 1 : 0;
        } else if (sortKey === "client_name" || sortKey === "status") {
            valA = (a[sortKey] || "").toLowerCase();
            valB = (b[sortKey] || "").toLowerCase();
        } else {
            valA = a[sortKey] ?? 0;
            valB = b[sortKey] ?? 0;
        }

        if (valA < valB) return sortDirection === "asc" ? -1 : 1;
        if (valA > valB) return sortDirection === "asc" ? 1 : -1;
        
        const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return createdA - createdB;
    });

    if (resetPage) currentPage = 1;
    renderTable();
}

/** Updates sorting direction arrows in the table headers. */
function updateSortIcons() {
    // Clear all icons
    document.querySelectorAll(".sort-icon").forEach(icon => {
        icon.className = "sort-icon";
    });

    // Clear all header active classes
    document.querySelectorAll("th.sortable").forEach(th => {
        th.classList.remove("active-asc", "active-desc");
    });

    // Set active icon
    const activeIcon = document.getElementById(`sort-icon-${sortKey}`);
    if (activeIcon) {
        activeIcon.classList.add(sortDirection);
    }

    // Set active header
    const activeHeader = document.querySelector(`th[data-key="${sortKey}"]`);
    if (activeHeader) {
        activeHeader.classList.add(`active-${sortDirection}`);
    }
}

/* ================= SERVICE TIME COMPUTATION ================= */

/** Calculates queue transaction duration in milliseconds. */
function computeServiceTimeMs(item) {
    if (!item.completed_at || !item.created_at) return -1;
    return new Date(item.completed_at).getTime() - new Date(item.created_at).getTime();
}

/** Formats transaction time into readable minute and second string. */
function formatServiceTime(item) {
    const ms = computeServiceTimeMs(item);
    if (ms < 0) return "—";

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${mins}m ${secs}s`;
    }
    return `${mins}m ${secs}s`;
}

/* ================= DATETIME FORMATTING ================= */

/** Formats ISO datetime string to a human-readable local date and time. */
function formatDatetime(isoStr) {
    if (!isoStr) return "—";
    const d = new Date(isoStr);
    const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
    return `${date}, ${time}`;
}

/** Computes and displays dashboard aggregate metrics. */
function updateStats() {
    const countByStatus = status => allData.filter(item => item.status === status).length;
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setText("statTotal", allData.length);
    setText("statPending", countByStatus("pending"));
    setText("statProcessing", countByStatus("processing"));
    setText("statForwarded", countByStatus("forwarded"));
    setText("statCompleted", countByStatus("completed"));
    setText("statPriority", allData.filter(item => item.priority !== "regular").length);
}

/** Updates the last synced timestamp display. */
function updateLastUpdated(message = null) {
    const el = document.getElementById("lastUpdated");
    if (!el) return;

    if (message) {
        el.textContent = message;
        return;
    }

    el.textContent = `Updated ${new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
    })}`;
}

/** Escapes double quotes and wraps values in quotes for CSV compliance. */
function escapeCsvValue(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
}

/** Escapes HTML characters to prevent XSS. */
function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/* ================= RENDERING ================= */

/** Renders rows for the paginated queue history table. */
function renderTable() {
    const body = document.getElementById("queueBody");
    // We'll update rows incrementally to avoid replacing the DOM node of the selected row (prevents blinking)

    const totalItems = filteredData.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / rowsPerPage));

    // Clamp current page
    if (currentPage > totalPages) currentPage = totalPages;

    const startIdx = (currentPage - 1) * rowsPerPage;
    const endIdx = Math.min(startIdx + rowsPerPage, totalItems);
    const pageData = filteredData.slice(startIdx, endIdx);

    body.querySelector(".empty-state")?.closest("tr")?.remove();
    if (pageData.length === 0) {
        body.innerHTML = `
            <tr>
                <td colspan="10" class="empty-state">No queue items found.</td>
            </tr>
        `;
    } else {
        // Map existing rows by id
        const existing = new Map();
        body.querySelectorAll('tr[data-entry-id]').forEach(r => existing.set(Number(r.dataset.entryId), r));

        const seen = new Set();

        pageData.forEach((item, idx) => {
            seen.add(item.id);
            const statusClass = `status-${item.status.toLowerCase()}`;
            const isPriority = item.priority !== "regular";
            const priorityClass = isPriority ? "priority-badge is-priority" : "priority-badge";

            let row = existing.get(item.id);
            if (!row) {
                row = document.createElement('tr');
                row.dataset.entryId = item.id;
                row.innerHTML = `
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                `;
                row.addEventListener('click', (e) => { e.stopPropagation(); selectRow(item.id, row); });
                body.appendChild(row);
            }

            // Update cell contents
            row.cells[1].textContent = item.queue_no;
            row.cells[2].textContent = item.client_name || "";
            row.cells[3].textContent = item.purpose || "";
            row.cells[4].innerHTML = `<span class="status-badge ${statusClass}">${escapeHtml((item.status || "").toUpperCase())}</span>`;
            row.cells[5].innerHTML = `<span class="${priorityClass}">${isPriority ? "Priority" : "Regular"}</span>`;
            row.cells[6].textContent = formatServiceTime(item);
            row.cells[7].textContent = formatDatetime(item.created_at);
            row.cells[8].textContent = formatDatetime(item.completed_at);

            row.classList.toggle('priority-row', isPriority);
            if (selectedEntryId === item.id) { 
                row.classList.add('selected') 
            } else { 
                row.classList.remove('selected');
            }
        });

        // Remove rows not on current page
        existing.forEach((r, id) => { if (!seen.has(id)) r.remove(); });

        // Update numbering
        body.querySelectorAll(".table-shell tbody tr").forEach((row, index) => {
            if (row.cells && row.cells[0]) row.cells[0].textContent = index + 1;
        });
    }

    // Update pagination
    document.getElementById("pageInfo").textContent = `Page ${currentPage} of ${totalPages}`;
    document.getElementById("prevPageBtn").disabled = currentPage <= 1;
    document.getElementById("nextPageBtn").disabled = currentPage >= totalPages;
    document.getElementById("totalCount").textContent = `${totalItems} item${totalItems !== 1 ? 's' : ''}`;

    updateSortIcons();
}

/** Renders an error message in the table row area on fetch failures. */
function renderLoadError(message) {
    const body = document.getElementById("queueBody");
    body.innerHTML = `
        <tr>
            <td colspan="10" class="empty-state">${message}</td>
        </tr>
    `;

    document.getElementById("pageInfo").textContent = "Page 1 of 1";
    document.getElementById("prevPageBtn").disabled = true;
    document.getElementById("nextPageBtn").disabled = true;
    document.getElementById("totalCount").textContent = "0 items";
}

/* ================= PAGINATION ================= */

/** Shifts the queue history current page. */
function changePage(delta) {
    const totalPages = Math.max(1, Math.ceil(filteredData.length / rowsPerPage));
    const newPage = currentPage + delta;

    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        renderTable();
    }
}

/** Updates rows per page limit and resets pagination. */
function changeRowsPerPage() {
    rowsPerPage = parseInt(document.getElementById("rowsPerPage").value);
    currentPage = 1;
    renderTable();
}

/* ================= CSV DOWNLOAD MODAL ================= */

/** Displays the CSV download parameter modal. */
function openDownloadModal() {
    document.getElementById("csvTodayOnly").checked = false;
    document.getElementById("csvDateRange").classList.remove("hidden");
    document.getElementById("csvDateFrom").value = "";
    document.getElementById("csvDateTo").value = "";
    document.getElementById("downloadModal").style.display = "flex";
}

/** Toggles the date-picker range fields depending on today-only status. */
function toggleCsvDateRange() {
    const todayChecked = document.getElementById("csvTodayOnly").checked;
    const dateRange = document.getElementById("csvDateRange");

    if (todayChecked) {
        dateRange.classList.add("hidden");
    } else {
        dateRange.classList.remove("hidden");
    }
}

/** Fetches filtered queue logs and triggers client-side CSV download. */
async function downloadCsv() {
    const todayOnly = document.getElementById("csvTodayOnly").checked;
    let url;

    if (todayOnly) {
        url = `${API_BASE}/today`;
    } else {
        const dateFrom = document.getElementById("csvDateFrom").value;
        const dateTo = document.getElementById("csvDateTo").value;

        if (!dateFrom && !dateTo) {
            alert("Please select at least one date, or check 'Today Only'.");
            return;
        }

        let params = [];
        if (dateFrom) params.push(`date_from=${dateFrom}`);
        if (dateTo) params.push(`date_to=${dateTo}`);

        url = `${API_BASE}/all`;
        if (params.length > 0) {
            url += `?${params.join("&")}`;
        }
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
            throw new Error("Queue API returned an unexpected response.");
        }

        if (data.length === 0) {
            alert("No data found for the selected date range.");
            return;
        }

        // Build CSV
        const headers = ["No.", "Q-No.", "Client Name", "Division", "Purpose", "Status", "Priority", "Service Time", "Created At", "Completed At"];

        const rows = data.map(item => [
            item.id,
            item.queue_no,
            item.client_name,
            item.division ? item.division.toUpperCase() : "",
            item.purpose || "",
            item.status ? item.status.toUpperCase() : "",
            item.priority !== "regular" ? escapeHtml(item.priority.toUpperCase()) : "Regular",
            formatServiceTime(item),
            item.created_at ? formatDatetime(item.created_at) : "",
            item.completed_at ? formatDatetime(item.completed_at) : ""
        ].map(escapeCsvValue));

        let csv = headers.map(escapeCsvValue).join(",") + "\n";
        rows.forEach(row => {
            csv += row.join(",") + "\n";
        });

        // Download
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const filename = todayOnly
            ? `queue_today_${new Date().toISOString().slice(0, 10)}.csv`
            : `queue_${document.getElementById("csvDateFrom").value || 
            "start"}_to_${document.getElementById("csvDateTo").value || "end"}.csv`;

        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);

        closeModal('downloadModal');

    } catch (error) {
        console.error("Error downloading CSV:", error);
        alert("Failed to download data. Please try again.");
    }
}

/* ================= VIEW STATISTICS ================= */
/** Opens the statistics analytics window. */
function openStatisticsModal() {
    loadStatistics("today");
    document.getElementById("statsModal").classList.remove("hidden");    
}

/** Closes the statistics analytics window. */
function closeStatisticsModal() {
    document.getElementById("statsModal").classList.add("hidden");    
}

// Chart.js instance
let statsChart = null;

// Load statistics based on selected range
/** Retrieves aggregated transaction counts for statistics panels. */
async function loadStatistics(period = "today") {
  try {
    const url = `${API_BASE}/statistics/completed?range=${period}&div=${userDivision}`;    
    const response = await fetch(url);
    const data = await response.json();

    renderChart(data.data);
    renderStatsTable(data.data);
  } catch (error) {
    console.error("Error loading statistics:", error);
  }
}

/** Builds dynamic SVG bar charts displaying daily or monthly processing history. */
function renderChart(data) {
    const tooltip = document.getElementById("chartTooltip");
    const chart = document.getElementById("statsChart");
    chart.innerHTML = "";
    const maxCount = Math.max( ...data.map(item => item.completed + item.deferred + item.pending), 1 );

    data.forEach(item => {
        const total = item.completed + item.deferred + item.pending;

        const container = document.createElement("div");
        container.className = "chart-bar-container";

        const value = document.createElement("div");
        value.className = "chart-value";
        value.textContent = total;

        const stack = document.createElement("div");
        stack.className = "chart-stack";

        const completedBar = document.createElement("div");
        completedBar.className = "chart-bar completed-bar";
        completedBar.style.height = `${(item.completed / maxCount) * 250}px`;

        const deferredBar = document.createElement("div");
        deferredBar.className = "chart-bar deferred-bar";
        deferredBar.style.height = `${(item.deferred / maxCount) * 250}px`;

        const pendingBar = document.createElement("div");
        pendingBar.className = "chart-bar pending-bar";
        pendingBar.style.height = `${(item.pending / maxCount) * 250}px`;

        completedBar.addEventListener("mousemove", e => {
            let html = `<strong>Completed: </strong>`;

            Object.entries(item.completed_divisions || {})
                .forEach(([div, count]) => {
                    html += `${count}<br>`;
                });

            tooltip.innerHTML = html;
            tooltip.style.left = `${e.clientX + 15}px`;
            tooltip.style.top = `${e.clientY + 15}px`;
            tooltip.style.display = "block";
        });

        completedBar.addEventListener("mouseleave", () => {
            tooltip.style.display = "none";
        });

        deferredBar.addEventListener("mousemove", e => {
            let html = `<strong>Deferred: </strong>`;

            Object.entries(item.deferred_divisions || {})
                .forEach(([div, count]) => {
                    html += `${count}<br>`;
                });

            tooltip.innerHTML = html;
            tooltip.style.left = `${e.clientX + 15}px`;
            tooltip.style.top = `${e.clientY + 15}px`;
            tooltip.style.display = "block";
        });

        deferredBar.addEventListener("mouseleave", () => {
            tooltip.style.display = "none";
        });

        pendingBar.addEventListener("mousemove", e => {
            let html = `<strong>Pending: </strong>`;

            Object.entries(item.pending_divisions || {})
                .forEach(([div, count]) => {
                    html += `${count}<br>`;
                });

            tooltip.innerHTML = html;
            tooltip.style.left = `${e.clientX + 15}px`;
            tooltip.style.top = `${e.clientY + 15}px`;
            tooltip.style.display = "block";
        });

        pendingBar.addEventListener("mouseleave", () => {
            tooltip.style.display = "none";
        });

        stack.appendChild(pendingBar);
        stack.appendChild(deferredBar);
        stack.appendChild(completedBar);

        const label = document.createElement("div");
        label.className = "chart-label";
        label.textContent = formatLabel(item.date, currentRange);

        container.appendChild(value);
        container.appendChild(stack);
        container.appendChild(label);

        chart.appendChild(container);
    });
}

/** Renders statistics data table summarizing completed, deferred, and pending tickets. */
function renderStatsTable(data) {
    const tbody = document.getElementById("statsTableBody");
    const completed = data.reduce( (total, item) => total + item.completed, 0 );
    const deferred = data.reduce( (total, item) => total + item.deferred, 0 );
    const pending = data.reduce( (total, item) => total + item.pending, 0 );
    tbody.innerHTML = `
        <tr>
            <td><span style="color:#22c55e;font-weight:600">Completed</span></td>
            <td>${completed}</td>
        </tr>
        <tr>
            <td><span style="color:#ef4444;font-weight:600">Deferred</span></td>
            <td>${deferred}</td>
        </tr>
        <tr>
            <td><span style="color:#FFE5B4;font-weight:600">Pending</span></td>
            <td>${pending}</td>
        </tr>
    `;
}

/** Formats chart labels depending on the selected range (today, 7days, etc.). */
function formatLabel(dateStr, range) {
    if (range === "today" || range === "yesterday") {
        return dateStr;
    }

    const d = new Date(dateStr);
    if (range === "7days" || range === "month") {
        return d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric"
        });
    }

    if (range === "year") {
        return d.toLocaleDateString("en-US", {
            month: "short"
        });
    }

    return dateStr;
}

let currentRange = "today";
const filterButtons = document.querySelectorAll(".filter-btn");

filterButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        currentRange = btn.dataset.range;
        filterButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        loadStatistics(currentRange);
    });
});

/* ================= LOGOUT MODAL ================= */
/** Opens the logout confirmation popup. */
function openLogoutModal(){
    document.getElementById("logoutModal").style.display = "flex";
}

/** Performs logout API request, deletes session data, and redirects to login. */
async function logout(){
    try {
        const response = await fetch(`../api/auth/logout`, {
            method: "POST"
        });

        if (!response.ok) {
            const errorData = await response.json();
            alert("Error: " + errorData.detail);
            window.location.reload();
            return;
        }

        localStorage.removeItem("userDiv");
        window.location.replace("../login/auth.html");
    } catch (error) {
        console.error("Error logging out:", error);
        alert("Failed to connect to the server.");
    }
}

/* ================= BUTTONS ================= */

/** Sends status update call for the currently highlighted queue item. */
async function updateCurrent(newStatus) {
    let status = newStatus;
    try {
        const currentId = selectedEntryId;

        await fetch(`${API_BASE}/status/${currentId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus })
        });

        // Clear selection if selected item no longer exists
        if (selectedEntryId !== null ) {
            selectedEntryId = null;
            currentQueueNumber = null;
        }

        await loadAllData(false);

    } catch (error) {
        console.error(`Error setting status to ${status}:`, error);
    }
}

/* ================= UTILITIES ================= */
/** Closes the designated popup window. */
function closeModal(modalId) {
    document.getElementById(modalId).style.display = "none";
    if (modalId === 'forwardedAnnouncementModal') {
        window.speechSynthesis.cancel();
    }
}

/** Toggles the clear button visibility for an input element depending on text entry. */
function toggleClearButton(input) {
    const clearBtn = input.parentElement.querySelector(".clear-btn");
    if (!clearBtn) return;
    clearBtn.classList.toggle("visible", input.value.trim());
}

/** Wipes clean the text input or select field. */
function clearField(fieldId) {
    const field = document.getElementById(fieldId);
    if (field.tagName === "SELECT") {
        field.selectedIndex = 0;
    } else {
        field.value = "";
    }

    toggleClearButton(field);
}

/* Entry Validation */
/** Asserts inputs for edit/creation forms are not blank. */
function validateForm(clientFieldId, purposeFieldId) {
    const clientField = document.getElementById(clientFieldId);
    const purposeField = document.getElementById(purposeFieldId);

    const isEditForm = clientFieldId.startsWith("fullEdit");
    const clientError = document.getElementById(isEditForm ? "editClientError" : "clientError");
    const purposeError = document.getElementById(isEditForm ? "editPurposeError" : "purposeError");

    let isValid = true;

    if (clientError) clientError.textContent = "";
    if (purposeError) purposeError.textContent = "";

    clientField.classList.remove("input-error");
    purposeField.classList.remove("input-error");

    if (!clientField.value.trim()) {
        if (clientError) clientError.textContent = "Please enter a client name.";
        clientField.classList.add("input-error");
        isValid = false;
    }

    if (!purposeField.value.trim()) {
        if (purposeError) purposeError.textContent = "Please enter a purpose.";
        purposeField.classList.add("input-error");
        isValid = false;
    }

    return isValid;
}

/* ================= ROW SELECTION ================= */

/** Sets the selected row element status active and updates control button states. */
function selectRow(id, rowElement){
    // Clear previous selection visual
    document.querySelectorAll(".table-shell tbody tr").forEach(r => r.classList.remove("selected"));
    if (rowElement) rowElement.classList.add("selected");

    // Store selection state
    selectedEntryId = id;
    currentEntryId = id;

    // Try to find queue number for the selected id
    const item = allData.find(it => it.id === id) || filteredData.find(it => it.id === id);
    currentQueueNumber = item ? item.queue_no : null;

    // Enable/disable action buttons
    if (item && item.status.toLowerCase() === "forwarded") {
        document.getElementById("completeBtn").disabled = false;
        document.getElementById("returnBtn").disabled = false;
    } else {
        document.getElementById("completeBtn").disabled = true;
        document.getElementById("returnBtn").disabled = true;
    }

    if (selectedEntryId) {
        document.getElementById("editEntryBtn").disabled = false;
        document.getElementById("transferEntryBtn").disabled = false;
    } else {
        document.getElementById("editEntryBtn").disabled = true;
        document.getElementById("transferEntryBtn").disabled = true;
    }
    // Sync number-grid active state
    document.querySelectorAll('.queue-number').forEach(b => {
        if (b.dataset && b.dataset.entryId && Number(b.dataset.entryId) === id) b.classList.add('active');
        else b.classList.remove('active');
    });
}

/* ================= EDIT ENTRY ================= */
let priorityType = null;

/** Opens the update detail dialog populated with the active row's data. */
async function openEditEntryModal() {
    try {
        const response = await fetch(`${API_BASE}/today`);
        const queue = await response.json();
        const item = queue.find(q => q.id === currentEntryId);
        if (!item) return;

        document.getElementById("entryId").value = item.id;
        document.getElementById("clientName").value = item.client_name.trim();
        document.getElementById("purpose").value = item.purpose.trim();
        priorityType = item.priority;

        toggleClearButton(document.getElementById("clientName"));
        toggleClearButton(document.getElementById("purpose"));
        document.getElementById("editEntryModal").style.display = "flex";

    } catch (error) {
        console.error("Error fetching item:", error);
    }
}

document.getElementById("editEntryModal").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!validateForm("clientName", "purpose")) return;

    const payload = {
        client_name: document.getElementById("clientName").value.trim(),
        purpose: document.getElementById("purpose").value.trim(),
        division: userDivision,
        priority: priorityType
    };
    const id = parseInt(document.getElementById("entryId").value);
    const newStatus = document.getElementById("updateStatus").value;

    try {
        const responseEdit = await fetch(`${API_BASE}/edit/${currentEntryId}`, {
            method: "PUT",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload)
        });

        if (!responseEdit.ok) {
            const errorData = await responseEdit.json();
            alert("Error: " + errorData.detail);
            return;
        }
        
        const responseStatus = await fetch(`${API_BASE}/status/${currentEntryId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus })
        });

        if (!responseStatus.ok) {
            const errorData = await responseStatus.json();
            alert("Error: " + errorData.detail);
            return;
        }

        closeModal('editEntryModal');
        loadAllData();
        currentEntryId = null;
        priorityType = null;
    } catch (error) {
        console.error(error);
    }
});

document.querySelectorAll(".status-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".status-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById("updateStatus").value = btn.dataset.status;
    });
});

/* ================= TRANSFER ENTRY ================= */
let clientName = null;
let purpose = null;

/** Opens the transfer destination selector populated with the active row's data. */
async function openTransferEntryModal() {
    try {
        const response = await fetch(`${API_BASE}/today`);
        const queue = await response.json();
        const item = queue.find(q => q.id === currentEntryId);
        if (!item) return;

        clientName = item.client_name;
        purpose = item.purpose;
        priorityType = item.priority;
        document.getElementById("transferEntryModal").style.display = "flex";
    } catch (error) {
        console.error("Error fetching item:", error);
    }
}

document.getElementById("transferEntryModal").addEventListener("submit", async function (e) {
    e.preventDefault();
    const payload = {
        client_name: clientName,
        purpose: purpose,
        division: document.getElementById("division").value,
        priority: priorityType
    };

    try {
        const responseEdit = await fetch(`${API_BASE}/edit/${currentEntryId}`, {
            method: "PUT",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload)
        });

        if (!responseEdit.ok) {
            const errorData = await responseEdit.json();
            alert("Error: " + errorData.detail);
            return;
        }

        closeModal('transferEntryModal');
        loadAllData();
        currentEntryId = null;
        priorityType = null;
    } catch (error) {
        console.error("Error fetching item:", error);
    }
});

/* ================= AUTO HTTP REFRESH ================= */

let pollingInterval = null;
let lastHeartbeat = 0;

/** Starts the automatic data sync interval process. */
function startPolling() {
    if (pollingInterval) {
        return;
    }

    pollingInterval = setInterval(async () => {
        try {
            await loadAllData(false);
            
            const now = Date.now();
            if (now - lastHeartbeat >= 5000) {
                lastHeartbeat = now;
                fetch("../api/auth/profile").catch(err => console.error("Heartbeat failed", err));
            }
        } catch (error) {
            console.error("Error refreshing data:", error);
        }
    }, 1000);
}

window.addEventListener("load", () => {
    loadDivisions();
    startPolling();
});

/** Fetches active divisions list and populates the transfer selection dropdown. */
async function loadDivisions() {
    try {
        const response = await fetch("../api/divisions");
        if (!response.ok) return;
        const divisions = await response.json();
        if (!Array.isArray(divisions)) return;

        const el = document.getElementById("division");
        if (!el) return;

        const currentVal = el.value;
        el.innerHTML = "";

        const defaultOpt = document.createElement("option");
        defaultOpt.value = "";
        defaultOpt.textContent = "Select";
        el.appendChild(defaultOpt);

        divisions.forEach(div => {
            const opt = document.createElement("option");
            opt.value = div.name;
            opt.textContent = div.display_name;
            el.appendChild(opt);
        });

        el.value = currentVal;
    } catch (e) {
        console.error("Error loading divisions:", e);
    }
}