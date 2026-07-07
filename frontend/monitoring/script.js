const API_BASE = "../api/queue";

/* ================= STATE ================= */

let allData = [];          // Raw data from server
let filteredData = [];     // After filters applied
let currentPage = 1;
let rowsPerPage = 6;
let sortKey = "created_at";
let sortDirection = "desc"; // "asc" or "desc"
let userDivision = localStorage.getItem("userDiv");   // Get assigned division

let selectedEntryId = null;
let currentEntryId = null;
let currentQueueNumber = null;

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
});

/* ================= DATA FETCHING ================= */

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
            item => item.division?.toLowerCase() === userDivision
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

function updateMonitoringDashboard() {
    const items = allData.filter(
        item =>
            item.status.toLowerCase() === "forwarded" &&
            item.division.toLowerCase() === userDivision.toLowerCase()
    );

    const display = document.getElementById("numberDisplay");
    const completeBtn = document.getElementById("completeBtn");
    const returnBtn = document.getElementById("returnBtn");

    if (!display) return;

    display.innerHTML = `<div class="number-grid"></div>`;
    const grid = display.querySelector(".number-grid");

    if (items.length === 0) {
        selectedEntryId = null;
        currentEntryId = null;
        currentQueueNumber = null;

        grid.innerHTML = `
            <div style="
                grid-column: 1 / -1;
                text-align: center;
                color: #888;
                font-weight: 700;
                padding: 20px;
            ">
                No Queue
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

        if (item.id === selectedEntryId) {
            btn.classList.add("active");
        }

        btn.addEventListener("click", () => {
            // Clicking the selected button deselects it
            if (selectedEntryId === item.id) {
                selectedEntryId = null;
                currentEntryId = null;
                currentQueueNumber = null;

                btn.classList.remove("active");
            } else {
                selectedEntryId = item.id;
                currentEntryId = item.id;
                currentQueueNumber = item.queue_no;

                document
                    .querySelectorAll(".queue-number")
                    .forEach(b => b.classList.remove("active"));

                btn.classList.add("active");
            }

                completeBtn.disabled = selectedEntryId === null;
            returnBtn.disabled = selectedEntryId === null;
            // Keep the table selection in sync with the number-grid selection
            renderTable();
        });

        grid.appendChild(btn);
    });

    completeBtn.disabled = selectedEntryId === null;
    returnBtn.disabled = selectedEntryId === null;
}

/* ================= TODAY TOGGLE ================= */

function onTodayToggle() {
    loadAllData();
}

/* ================= FILTERING ================= */

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

function applySorting(resetPage = true) {
    filteredData.sort((a, b) => {
        const statusPriority = {
            forwarded: 1,
            processing: 2,
            pending: 3,
            completed: 4,
            cancelled: 4
        };
        
        const priorityA = statusPriority[(a.status || "").toLowerCase()] ?? 999;
        const priorityB = statusPriority[(b.status || "").toLowerCase()] ?? 999;

        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }        
        
        const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return createdA - createdB;
        
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
        return 0;
    });

    if (resetPage) currentPage = 1;
    renderTable();
}

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

function computeServiceTimeMs(item) {
    if (!item.completed_at || !item.created_at) return -1;
    return new Date(item.completed_at).getTime() - new Date(item.created_at).getTime();
}

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

function formatDatetime(isoStr) {
    if (!isoStr) return "—";
    const d = new Date(isoStr);
    const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
    return `${date}, ${time}`;
}

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

function escapeCsvValue(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/* ================= RENDERING ================= */

function renderTable() {
    const body = document.getElementById("queueBody");
    body.innerHTML = "";

    const totalItems = filteredData.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / rowsPerPage));

    // Clamp current page
    if (currentPage > totalPages) currentPage = totalPages;

    const startIdx = (currentPage - 1) * rowsPerPage;
    const endIdx = Math.min(startIdx + rowsPerPage, totalItems);
    const pageData = filteredData.slice(startIdx, endIdx);

    if (pageData.length === 0) {
        body.innerHTML = `
            <tr>
                <td colspan="10" class="empty-state">No queue items found.</td>
            </tr>
        `;
    } else {
        pageData.forEach(item => {
            const statusClass = `status-${item.status.toLowerCase()}`;
            const isPriority = item.priority !== "regular";
            const priorityClass = isPriority ? "priority-badge is-priority" : "priority-badge";

            const rowClasses = [];
            if (isPriority) rowClasses.push('priority-row');
            if (item.id === selectedEntryId) rowClasses.push('selected-row');

            const inlineStyle = item.id === selectedEntryId ? 'style="background:#FFF8C6;"' : '';

            body.innerHTML += `
            <tr data-entry-id="${item.id}" class="${rowClasses.join(' ')}" ${inlineStyle}>
                <td></td>
                <td>${item.queue_no}</td>
                <td>${escapeHtml(item.client_name)}</td>
                <td>${escapeHtml(item.purpose)}</td>
                <td><span class="status-badge ${statusClass}">${escapeHtml(item.status.toUpperCase())}</span></td>
                <td><span class="${priorityClass}">${isPriority ? "Priority" : "Regular"}</span></td>
                <td>${formatServiceTime(item)}</td>
                <td>${formatDatetime(item.created_at)}</td>
                <td>${formatDatetime(item.completed_at)}</td>
            </tr>
            `;
        });

        document.querySelectorAll(".table-shell tbody tr").forEach((row, index) => {
            row.cells[0].textContent = index + 1;
        });
    }

    // Update pagination
    document.getElementById("pageInfo").textContent = `Page ${currentPage} of ${totalPages}`;
    document.getElementById("prevPageBtn").disabled = currentPage <= 1;
    document.getElementById("nextPageBtn").disabled = currentPage >= totalPages;
    document.getElementById("totalCount").textContent = `${totalItems} item${totalItems !== 1 ? 's' : ''}`;

    updateSortIcons();
}

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

function changePage(delta) {
    const totalPages = Math.max(1, Math.ceil(filteredData.length / rowsPerPage));
    const newPage = currentPage + delta;

    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        renderTable();
    }
}

function changeRowsPerPage() {
    rowsPerPage = parseInt(document.getElementById("rowsPerPage").value);
    currentPage = 1;
    renderTable();
}

/* ================= CSV DOWNLOAD MODAL ================= */

function openDownloadModal() {
    document.getElementById("csvTodayOnly").checked = false;
    document.getElementById("csvDateRange").classList.remove("hidden");
    document.getElementById("csvDateFrom").value = "";
    document.getElementById("csvDateTo").value = "";
    document.getElementById("downloadModal").style.display = "flex";
}

function toggleCsvDateRange() {
    const todayChecked = document.getElementById("csvTodayOnly").checked;
    const dateRange = document.getElementById("csvDateRange");

    if (todayChecked) {
        dateRange.classList.add("hidden");
    } else {
        dateRange.classList.remove("hidden");
    }
}

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
            item.purpose,
            item.division.toUpperCase(),
            item.status.toUpperCase(),
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
function openStatisticsModal() {
    loadStatistics("today");
    document.getElementById("statsModal").classList.remove("hidden");    
}

function closeStatisticsModal() {
    document.getElementById("statsModal").classList.add("hidden");    
}

// Chart.js instance
let statsChart = null;

// Load statistics based on selected range
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

function renderChart(data) {
    const tooltip = document.getElementById("chartTooltip");
    const chart = document.getElementById("statsChart");
    chart.innerHTML = "";
    const maxCount = Math.max( ...data.map(item => item.completed + item.cancelled + item.pending), 1 );

    data.forEach(item => {
        const total = item.completed + item.cancelled + item.pending;

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

        const cancelledBar = document.createElement("div");
        cancelledBar.className = "chart-bar cancelled-bar";
        cancelledBar.style.height = `${(item.cancelled / maxCount) * 250}px`;

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

        cancelledBar.addEventListener("mousemove", e => {
            let html = `<strong>Cancelled: </strong>`;

            Object.entries(item.cancelled_divisions || {})
                .forEach(([div, count]) => {
                    html += `${count}<br>`;
                });

            tooltip.innerHTML = html;
            tooltip.style.left = `${e.clientX + 15}px`;
            tooltip.style.top = `${e.clientY + 15}px`;
            tooltip.style.display = "block";
        });

        cancelledBar.addEventListener("mouseleave", () => {
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
        stack.appendChild(cancelledBar);
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

function renderStatsTable(data) {
    const tbody = document.getElementById("statsTableBody");
    const completed = data.reduce( (total, item) => total + item.completed, 0 );
    const cancelled = data.reduce( (total, item) => total + item.cancelled, 0 );
    const pending = data.reduce( (total, item) => total + item.pending, 0 );
    tbody.innerHTML = `
        <tr>
            <td><span style="color:#22c55e;font-weight:600">Completed</span></td>
            <td>${completed}</td>
        </tr>
        <tr>
            <td><span style="color:#ef4444;font-weight:600">Cancelled</span></td>
            <td>${cancelled}</td>
        </tr>
        <tr>
            <td><span style="color:#FFE5B4;font-weight:600">Pending</span></td>
            <td>${pending}</td>
        </tr>
    `;
}

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
function openLogoutModal(){
    document.getElementById("logoutModal").style.display = "flex";
}

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
            currentEntryId = null;
            currentQueueNumber = null;
        }

        await loadAllData(false);

    } catch (error) {
        console.error(`Error setting status to ${status}:`, error);
    }
}

/* ================= UTILITIES ================= */
// Close modals
function closeModal(modalId) {
    document.getElementById(modalId).style.display = "none";
}

/* ================= WEBSOCKET ================= */
let socket = null;
let reconnectTimeout = null;
let pollingInterval = null;

function startPollingFallback() {
    if (pollingInterval) {
        return;
    }

    pollingInterval = setInterval(async () => {
        await loadAllData(false);
    }, 5000);
}

function connectWebSocket() {
    const userId = localStorage.getItem("userId");

    if (!userId) {
        console.warn("No userId found. WebSocket will not connect.");
        return;
    }

    // Prevent duplicate connections
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const pathParts = window.location.pathname.split('/');
    const modules = ['login', 'operator', 'monitoring', 'tv', 'client', 'assets'];
    const moduleIndex = pathParts.findIndex(part => modules.includes(part));
    const basePath = moduleIndex !== -1 ? pathParts.slice(0, moduleIndex).join('/') : '';
    const wsUrl = `${protocol}//${window.location.host}${basePath}/api/ws/connect/${userId}`;
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log("WebSocket connected.");

        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }

        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
    };

    socket.onmessage = async () => {
        console.log("Server update received → refreshing data");
        await loadAllData(false);
    };

    socket.onclose = () => {
        console.log("WebSocket disconnected. Reconnecting in 5 seconds...");
        startPollingFallback();
        reconnectTimeout = setTimeout(() => { connectWebSocket(); }, 5000);
    };

    socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        try {
            socket.close();
        } catch (e) {}
    };
}

window.addEventListener("load", () => {
    startPollingFallback();
    connectWebSocket();
});
