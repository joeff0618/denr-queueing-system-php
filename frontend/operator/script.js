const API_BASE = "../api/queue";

let selectedEntryId = null;
let allQueueData = [];
let filteredQueueData = [];
let operatorSortKey = "queue_order";
let operatorSortDirection = "asc";

let allUserData = [];
let filteredUserData = [];
let userSortKey = "id";
let userSortDirection = "asc";
let userCurrentPage = 1;
let userRowsPerPage = 6;
let selectedUserId = null;

let userDivision = localStorage.getItem("userDiv");

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
                if (data.division !== "lobby" && data.division !== "sadmin") {                                                                                    
                    // If not, redirect them to their designated monitoring page                                                      
                    window.location.replace("../monitoring/index.html");                                                                
                    return;                                                                                                           
                }                                                                                                                     
                                                                                                                                      
                // If they are authorized, make the page contents visible                                                             
                document.documentElement.style.display = "block";                                                                     
            } catch (e) {                                                                                                             
                window.location.replace("../login/auth.html");                                                                          
            }
        })();

/* ================= PAGE SWITCH ================= */

/** Switches the active sub-page in the operator panel dashboard view. */
function showPage(id) {
    if (id === "userPage" && (!userDivision || userDivision.toLowerCase() !== "sadmin")) {
        alert("Access Denied: Administrative privileges required.");
        return;
    }

    document.querySelectorAll(".page")
        .forEach(p => p.classList.remove("active"));

    document.getElementById(id).classList.add("active");
    clearSelection();
    if (id === "userPage") {
        loadUsers();
    } else {
        loadQueue();
    }
}

/* ================= INITIAL LOAD ================= */

togglePanelButtons();
loadQueue();
loadStatistics("today");

/* ================= VALIDATE ENTRY ==============*/
/** Asserts form client and purpose inputs are filled correctly. */
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

/* ================= ADD AND EDIT ENTRY DATA ================= */
let modalMode = "add";

/* OPEN ADD */
/** Opens the creation modal for adding a new queue item. */
function add() {
    modalMode = "add";

    document.getElementById("modalTitle").textContent = "Add Entry";
    document.getElementById("submitBtn").textContent = "Save";
    document.getElementById("entryForm").reset();
    document.getElementById("entryId").value = "";

    togglePriorityOptions();
    document.getElementById("entryModal").style.display = "flex";
    toggleClearButton(document.getElementById("clientName"));
    toggleClearButton(document.getElementById("purpose"));
}

/* OPEN EDIT */
/** Populates and displays the edit details modal for the selected item. */
async function openSelectedEdit() {
    try {
        const response = await fetch(`${API_BASE}/today`);
        const queue = await response.json();
        const item = queue.find(q => q.id === selectedEntryId);

        if (!item) return;

        modalMode = "edit";

        document.getElementById("modalTitle").textContent = "Edit Entry";
        document.getElementById("submitBtn").textContent = "Save Changes";
        document.getElementById("entryId").value = item.id;
        document.getElementById("clientName").value = item.client_name.trim();
        document.getElementById("purpose").value = item.purpose.trim();
        document.getElementById("division").value = item.division;
        document.getElementById("priority").value = item.priority !== "regular" ? "true" : "false";
        if (item.priority !== "regular") {
            document.getElementById("priorityType").value = item.priority;
        }

        toggleClearButton(document.getElementById("clientName"));
        toggleClearButton(document.getElementById("purpose"));
        togglePriorityOptions();
        document.getElementById("entryModal").style.display = "flex";

    } catch (error) {
        console.error("Error fetching item:", error);
    }
}

/* SUBMIT */

document.getElementById("entryForm")
.addEventListener("submit", async function (e) {
    e.preventDefault();

    if (!validateForm("clientName", "purpose")) {
        return;
    }

    let priorityType;
    const id = document.getElementById("entryId").value;
    
    if (document.getElementById("priority").value === "true") {
        priorityType = document.getElementById("priorityType").value;
    } else {
        priorityType = "regular";
    }

    const payload = {
        client_name: document.getElementById("clientName").value.trim(),
        purpose: document.getElementById("purpose").value.trim(),
        division: document.getElementById("division").value,
        priority: priorityType
    };

    /* ================= ADD ================= */
    try {
        if (modalMode === "add") {
            const cardsRes = await fetch(`${API_BASE}/available-cards`);
            const cardsData = await cardsRes.json();

            if (cardsData.available_cards.length === 0) {
                showCustomKioskModal("No Cards Available", "All 30 physical cards are currently in use.", false);
                return;
            }

            payload.queue_no = cardsData.available_cards[0];
            const response = await fetch(`${API_BASE}/add`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                showCustomKioskModal("Submission Error", errorData.detail || "Unable to queue this ticket.", false);
                return;
            }

            const newItem = await response.json();
            showCustomKioskModal(
                "Ticket Created!",
                `Name: ${newItem.client_name}\n\nPlease hand physical card #${newItem.queue_no} to the client.`,
                true,
                newItem.queue_no
            );
        }

    /* ================= EDIT ================= */
        else {
            const response = await fetch(`${API_BASE}/edit/${id}`, {
                    method: "PUT",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                alert("Error: " + errorData.detail);
                return;
            }
        }

        closeModal('entryModal');
        loadQueue();
        clearSelection();
    } catch (error) {
        console.error(error);
        showCustomKioskModal("Connection Error", "Failed to connect to the server.", false);
    }
});

// Custom Creation Modal logic for Operator
/** Opens the operator confirmation overlay dialog for queue creations. */
function showCustomKioskModal(title, message, isSuccess = true, queueNo = null) {
    const modal = document.getElementById("customModal");
    const modalTitle = document.getElementById("modalTitle");
    const modalMessage = document.getElementById("modalMessage");
    const iconContainer = document.getElementById("modalIconContainer");
    const icon = document.getElementById("modalIcon");
    const queueNoContainer = document.getElementById("modalQueueNoContainer");

    modalTitle.textContent = title;
    modalMessage.textContent = message;

    if (queueNoContainer) {
        if (queueNo !== null) {
            queueNoContainer.textContent = queueNo;
            queueNoContainer.style.display = "inline-flex";
        } else {
            queueNoContainer.style.display = "none";
        }
    }

    if (isSuccess) {
        iconContainer.className = "modal-icon-container success";
        icon.className = "ph ph-check-circle";
    } else {
        iconContainer.className = "modal-icon-container error";
        icon.className = "ph ph-warning-circle";
    }

    modal.style.display = "flex";
}

document.getElementById("modalCloseBtn").addEventListener("click", () => {
    closeModal("customModal");
});

/* PRIORITY */
const prioritySelect = document.getElementById("priority");
const priorityOptions = document.getElementById("priorityOptions");

/** Toggles the priority description drop-down options area. */
function togglePriorityOptions() {
    priorityOptions.style.display = prioritySelect.value === "true" ? "block" : "none";
}

prioritySelect.addEventListener( "change", togglePriorityOptions );
const buttons = document.querySelectorAll('.priority-btn');
const priorityInput = document.getElementById('priorityType');

buttons.forEach(button => {
    button.addEventListener('click', () => {
        buttons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        priorityInput.value = button.dataset.value;
    });
});

/** Sets operator control button state options. */
function setPanelButtonState(buttonId, enabled) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;

    btn.disabled = !enabled;
    btn.setAttribute("aria-disabled", String(!enabled));
    btn.classList.toggle("is-disabled", !enabled);
    btn.style.pointerEvents = enabled ? "auto" : "none";
    btn.style.opacity = enabled ? "1" : "0.6";
    btn.style.cursor = enabled ? "pointer" : "not-allowed";
}

/** Enables or disables panel action controls based on the selected item's status. */
function togglePanelButtons(status = null) {
    const ids = [
        "skipBtn",
        "forwardBtn",
        "completeBtn",
        "cancelBtn"
    ];

    ids.forEach(id => setPanelButtonState(id, false));

    const normalizedStatus = (status || "").toLowerCase();

    const enableButton = (id) => setPanelButtonState(id, true);

    switch (normalizedStatus) {
        case "processing":
            setPanelButtonState("flashBtn", false);
            enableButton("skipBtn");
            enableButton("forwardBtn");
            enableButton("completeBtn");
            enableButton("cancelBtn");
            break;

        case "pending":
            enableButton("flashBtn");
            enableButton("skipBtn");
            enableButton("forwardBtn");
            enableButton("completeBtn");
            enableButton("cancelBtn");
            break;

        case "forwarded":
            setPanelButtonState("flashBtn", false);
            enableButton("flashBtn");
            enableButton("completeBtn");
            enableButton("cancelBtn");
            break;
    
        case "completed":
        case "deferred":
            setPanelButtonState("flashBtn", false);
            break;
    }
}

/** Syncs the action buttons panel according to the highlighted row's status. */
function syncPanelButtonsForSelection() {
    if (!selectedEntryId) {
        togglePanelButtons();
        return;
    }

    const selectedItem = allQueueData.find(item => item.id === selectedEntryId);
    togglePanelButtons(selectedItem?.status);
}


/* UTILITIES (MODALS) */
/** Opens the specified dialog overlay. */
function openModal(modalId) {
    document.getElementById(modalId).style.display = "flex";
    if(modalId === "statsModal") resetStatisticsFilters();
}

/** Closes the specified dialog overlay. */
function closeModal(modalId) {
    document.getElementById(modalId).style.display = "none";
    if(modalId === "statsModal") resetStatisticsFilters();
}

/** Toggles clear button visibility on the input parent element. */
function toggleClearButton(input) {
    const clearBtn = input.parentElement.querySelector(".clear-btn");
    if (!clearBtn) return;
    clearBtn.classList.toggle("visible", input.value.trim());
}

/** Clears form inputs and reset selects to default. */
function clearField(fieldId) {
    const field = document.getElementById(fieldId);
    if (field.tagName === "SELECT") {
        field.selectedIndex = 0;
    } else {
        field.value = "";
    }

    toggleClearButton(field);
}

/* ================= ANNOUNCEMENT ================= */
/** Submits the text string announcement parameter to the API. */
async function saveAnnouncement() {
    const text = document.getElementById("messageText").value;
    try {
        const response = await fetch(`${API_BASE}/announcement`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            alert("Error: " + (errorData.detail || "Failed to update announcement"));
            return;
        }
        
        closeModal("announcementModal");
    } catch (error) {
        console.error("Error saving announcement:", error);
        alert("Failed to connect to the server.");
    }
}

/* ================= VIEW STATISTICS ================= */
// Chart.js instance
let statsChart = null;

// Load statistics based on selected range
/** Calls the completed ticket statistics endpoint based on active range filters. */
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

/** Renders statistics data bars for performance charts. */
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

        completedBar.addEventListener("mousemove", e => {
            let html = `<strong>Completed</strong><br>`;

            Object.entries(item.completed_divisions || {})
                .forEach(([div, count]) => {
                    html += `${div.toUpperCase()}: ${count}<br>`;
                });

            tooltip.innerHTML = html;
            tooltip.style.left = `${e.clientX + 15}px`;
            tooltip.style.top = `${e.clientY + 15}px`;
            tooltip.style.display = "block";
        });

        completedBar.addEventListener("mouseleave", () => {
            tooltip.style.display = "none";
        });

        const deferredBar = document.createElement("div");
        deferredBar.className = "chart-bar deferred-bar";
        deferredBar.style.height = `${(item.deferred / maxCount) * 250}px`;

        deferredBar.addEventListener("mousemove", e => {
            let html = `<strong>Deferred</strong><br>`;

            Object.entries(item.deferred_divisions || {})
                .forEach(([div, count]) => {
                    html += `${div.toUpperCase()}: ${count}<br>`;
                });

            tooltip.innerHTML = html;
            tooltip.style.left = `${e.clientX + 15}px`;
            tooltip.style.top = `${e.clientY + 15}px`;
            tooltip.style.display = "block";
        });

        deferredBar.addEventListener("mouseleave", () => {
            tooltip.style.display = "none";
        });

        const pendingBar = document.createElement("div");
        pendingBar.className = "chart-bar pending-bar";
        pendingBar.style.height = `${(item.pending / maxCount) * 250}px`;

        pendingBar.addEventListener("mousemove", e => {
            let html = `<strong>Pending</strong><br>`;

            Object.entries(item.pending_divisions || {})
                .forEach(([div, count]) => {
                    html += `${div.toUpperCase()}: ${count}<br>`;
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

/** Renders the overview grid summary for statistics results. */
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

/** Formats statistical label texts. */
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

// Filter buttons
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

/* ================= LOAD QUEUE ================= */

/** Fetches the latest queue status data list from the server. */
async function loadQueue(){
    try {
        const response = await fetch(`${API_BASE}/today`);
        if (!response.ok) {
            throw new Error(`Request failed: ${response.status} ${response.statusText}`);
        }

        const queue = await response.json();
        if (!Array.isArray(queue)) {
            throw new Error("Queue API returned an unexpected response.");
        }

        allQueueData = queue;
        syncPanelButtonsForSelection();
        updateOperatorDashboard();
        updateOperatorLastUpdated();
        applyQueueFilters();
        applyDepartmentAccess()

    } catch (error) {
        console.error("Error loading queue:", error);
        renderQueueError("Failed to load queue data.");
        updateOperatorLastUpdated("Unable to sync");
    }
}

/* TABLE FILTERS */
/** Redirects filters to User list or Queue list depending on active page view. */
function filterTable(){
    const userPageEl = document.getElementById("userPage");
    if (userPageEl && userPageEl.classList.contains("active")) {
        applyUserFilters();
    } else {
        applyQueueFilters();
    }
}

/** Filters the queue table based on search, division, priority, status and dates. */
function applyQueueFilters() {
    const search = document.getElementById("searchInput").value.toLowerCase();
    
    // Read from modal elements
    const div = document.getElementById("filterDivision")?.value.toLowerCase() || "";
    const priorityFilter = document.getElementById("filterPriority")?.value || ""; // "priority" or "regular" or ""
    const statusFilter = document.getElementById("filterStatus")?.value.toLowerCase() || "";
    const startDatetimeVal = document.getElementById("filterStartDatetime")?.value || "";
    const endDatetimeVal = document.getElementById("filterEndDatetime")?.value || "";

    const hideCompleted = document.getElementById("hideCompleted")?.checked;

    const startTime = startDatetimeVal ? new Date(startDatetimeVal).getTime() : null;
    const endTime = endDatetimeVal ? new Date(endDatetimeVal).getTime() : null;

    filteredQueueData = allQueueData.filter(item => {
        // Search text match
        const text = `${item.id} ${item.queue_no} ${item.client_name} ${item.purpose} ${item.division} ${item.status}`.toLowerCase();
        const matchSearch = !search || text.includes(search);

        // Division match (if "smd" is chosen, match smd, r-smd, and sr-smd)
        let matchDiv = true;
        if (div) {
            const itemDiv = item.division.toLowerCase();
            if (div === 'smd') {
                matchDiv = (itemDiv === 'smd' || itemDiv === 'r-smd' || itemDiv === 'sr-smd');
            } else {
                matchDiv = (itemDiv === div);
            }
        }

        // Priority match
        let matchPriority = true;
        if (priorityFilter === "priority") {
            matchPriority = (item.priority !== "regular");
        } else if (priorityFilter === "regular") {
            matchPriority = (item.priority === "regular");
        }

        // Status match
        const matchStatus = !statusFilter || item.status.toLowerCase() === statusFilter;

        // Hide completed toggle override
        const filterCompleted = statusFilter === "completed" || !hideCompleted || item.status.toLowerCase() !== "completed";

        // Datetime range match
        let matchTime = true;
        if (item.created_at) {
            const itemTime = new Date(item.created_at).getTime();
            if (startTime && itemTime < startTime) matchTime = false;
            if (endTime && itemTime > endTime) matchTime = false;
        } else if (startTime || endTime) {
            matchTime = false;
        }

        return matchSearch && matchDiv && matchPriority && matchStatus && filterCompleted && matchTime;
    });

    sortFilteredQueue();
    renderQueueTable();
}

/** Applies active filters from the filters modal dialog. */
function applyFilterModal() {
    applyQueueFilters();
    closeModal('filterModal');
    updateFilterButtonActiveState();
}

/** Resets all active table filters to default. */
function clearFilters() {
    if (document.getElementById("filterDivision")) document.getElementById("filterDivision").value = "";
    if (document.getElementById("filterPriority")) document.getElementById("filterPriority").value = "";
    if (document.getElementById("filterStatus")) document.getElementById("filterStatus").value = "";
    if (document.getElementById("filterStartDatetime")) document.getElementById("filterStartDatetime").value = "";
    if (document.getElementById("filterEndDatetime")) document.getElementById("filterEndDatetime").value = "";
    
    applyQueueFilters();
    updateFilterButtonActiveState();
    closeModal('filterModal');
}

/** Updates the visual state of the filter button indicator badge. */
function updateFilterButtonActiveState() {
    const btn = document.getElementById("openFilterBtn");
    if (!btn) return;
    
    const div = document.getElementById("filterDivision")?.value || "";
    const priority = document.getElementById("filterPriority")?.value || "";
    const status = document.getElementById("filterStatus")?.value || "";
    const start = document.getElementById("filterStartDatetime")?.value || "";
    const end = document.getElementById("filterEndDatetime")?.value || "";
    
    const isFiltering = (div || priority || status || start || end);
    
    if (isFiltering) {
        btn.classList.add("active");
        btn.innerHTML = `<i class="ph ph-sliders-horizontal"></i> Filter <span class="filter-indicator"></span>`;
    } else {
        btn.classList.remove("active");
        btn.innerHTML = `<i class="ph ph-sliders-horizontal"></i> Filter`;
    }
}

/** Directs table sorting actions based on target key. */
function sortQueueBy(key) {
    const userPageEl = document.getElementById("userPage");
    if (userPageEl && userPageEl.classList.contains("active")) {
        sortUsersBy(key);
    } else {
        if (operatorSortKey === key) {
            operatorSortDirection = operatorSortDirection === "asc" ? "desc" : "asc";
        } else {
            operatorSortKey = key;
            operatorSortDirection = "asc";
        }

        sortFilteredQueue();
        renderQueueTable();
    }
}

/** Sorts the queue items array based on operatorSortKey and direction. */
function sortFilteredQueue() {
    filteredQueueData.sort((a, b) => {
        const aProcessing = a.status === "processing";
        const bProcessing = b.status === "processing";

        if (aProcessing && !bProcessing) return -1;
        if (!aProcessing && bProcessing) return 1;

        let valA;
        let valB;

        if (operatorSortKey === "queue_order") {
            return compareQueueOrder(a, b);
        }

        if (operatorSortKey === "priority") {
            valA = a.priority !== "regular" ? 1 : 0;
            valB = b.priority !== "regular" ? 1 : 0;
        } else if (operatorSortKey === "created_at") {
            valA = a.created_at ? new Date(a.created_at).getTime() : 0;
            valB = b.created_at ? new Date(b.created_at).getTime() : 0;
        } else if (["client_name", "purpose", "division", "status"].includes(operatorSortKey)) {
            valA = (a[operatorSortKey] || "").toLowerCase();
            valB = (b[operatorSortKey] || "").toLowerCase();
        } else {
            valA = a[operatorSortKey] ?? 0;
            valB = b[operatorSortKey] ?? 0;
        }

        if (valA < valB) return operatorSortDirection === "asc" ? -1 : 1;
        if (valA > valB) return operatorSortDirection === "asc" ? 1 : -1;
        return compareQueueOrder(a, b);
    });
}

/** Toggles visibility of completed tickets. */
function hideCompletedToggle() {
    applyQueueFilters();
}

/** Custom sorting helper logic for queue items. */
function compareQueueOrder(a, b) {
    const aDone = ["completed", "deferred"].includes(a.status);
    const bDone = ["completed", "deferred"].includes(b.status);

    if (aDone && !bDone) return 1;
    if (!aDone && bDone) return -1;

    // Sort by effective_priority score descending (higher score served first)
    const aScore = a.effective_priority ?? 0;
    const bScore = b.effective_priority ?? 0;
    if (bScore !== aScore) return bScore - aScore;

    // Tie-breaker: earliest created_at first
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return aTime - bTime;
}

/** Populates the main queue HTML table with filtered results. */
function renderQueueTable() {
    const body = document.getElementById("queueBody");
    body.innerHTML = "";

    if (filteredQueueData.length === 0) {
        body.innerHTML = `
            <tr>
                <td colspan="10" class="empty-state">No queue entries found.</td>
            </tr>
        `;
        updateOperatorSortIcons();
        return;
    }

    filteredQueueData.forEach(item => {
        const divClass = item.division.toLowerCase().replace(/\s/g,'');
        const statusClass = `status-${item.status.toLowerCase()}`;
        const isPriority = item.priority !== "regular";
        const priorityClass = isPriority ? "priority-badge is-priority" : "priority-badge";
        const isSelected = selectedEntryId === item.id;
        const scoreDisplay = item.effective_priority != null ? item.effective_priority.toFixed(1) : "-";

        body.innerHTML += `
        <tr class="${isPriority ? "priority-row" : ""} ${isSelected ? "selected" : ""}" onclick="selectRow(${item.id}, this)">
            <td></td>
            <td><span class="queue-number-pill">${item.queue_no}</span></td>
            <td>${escapeHtml(item.client_name)}</td>
            <td>${escapeHtml(item.purpose)}</td>
            <td><span class="div-badge ${divClass}">${escapeHtml(item.division.toUpperCase())}</span></td>
            <td><span class="status-badge ${statusClass}">${escapeHtml(item.status.toUpperCase())}</span></td>
            <td><span class="${priorityClass}">${isPriority ? "Priority" : "Regular"}</span></td>
            <td>${formatOperatorTime(item)}</td>
            <td>
                <button class="update-btn"
                    onclick="event.stopPropagation(); updateEntry(${item.id})">
                    Update
                </button>
            </td>
        </tr>
        `;
    });

    document.querySelectorAll(".table-shell tbody tr").forEach((row, index) => {
        row.cells[0].textContent = index + 1;
    });

    updateOperatorSortIcons();
}

/** Displays error details inside the queue table view. */
function renderQueueError(message) {
    document.getElementById("queueBody").innerHTML = `
        <tr>
            <td colspan="10" class="empty-state">${message}</td>
        </tr>
    `;
}

/** Refreshes sorting arrow icons in the table header. */
function updateOperatorSortIcons() {
    document.querySelectorAll(".sort-icon").forEach(icon => {
        icon.className = "sort-icon";
    });

    document.querySelectorAll("th.sortable").forEach(th => {
        th.classList.remove("active-asc", "active-desc");
    });

    if (operatorSortKey === "queue_order") return;

    const activeIcon = document.getElementById(`sort-icon-${operatorSortKey}`);
    if (activeIcon) activeIcon.classList.add(operatorSortDirection);

    const activeHeader = document.querySelector(`th[data-key="${operatorSortKey}"]`);
    if (activeHeader) activeHeader.classList.add(`active-${operatorSortDirection}`);
}

/** Refreshes dashboard metrics representing queue count and current ticket number. */
function updateOperatorDashboard() {
    const processingItems = allQueueData.filter(item => item.status.toLowerCase() === "processing");
    
    const display = document.getElementById("operatorNumberDisplay");
    if (display) {
        display.innerHTML = `<div class="number-grid"></div>`;
        const grid = display.querySelector(".number-grid");
        
        if (processingItems.length === 0) {
            grid.innerHTML = `
                <div style="
                    grid-column: 1 / -1;
                    text-align: center;
                    color: var(--muted);
                    font-weight: 700;
                    padding: 20px;
                ">
                    -
                </div>
            `;
        } else {
            processingItems.forEach(item => {
                const btn = document.createElement("button");
                btn.className = "queue-number";
                btn.textContent = String(item.queue_no);
                
                if (item.id === selectedEntryId) {
                    btn.classList.add("active");
                }
                
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (selectedEntryId === item.id) {
                        clearSelection();
                    } else {
                        // Find matching row
                        const row = document.querySelector(`tr[onclick*="selectRow(${item.id}"]`);
                        selectedEntryId = item.id;
                        document.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
                        if (row) {
                            row.classList.add("selected");
                        }
                        
                        document.querySelectorAll(".queue-number").forEach(b => b.classList.remove("active"));
                        btn.classList.add("active");
                        
                        document.getElementById("editSelectedBtn").classList.add("show");
                        document.getElementById("deleteSelectedBtn").classList.add("show");
                        syncPanelButtonsForSelection();
                    }
                });
                
                grid.appendChild(btn);
            });
        }
    }

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    const firstProc = processingItems[0];
    setText("current-qno", firstProc ? firstProc.queue_no : "-");
    setText("dashNowServing", firstProc ? `#${firstProc.queue_no}` : "-");
    setText("dashPending", allQueueData.filter(item => item.status === "pending").length);
    setText("dashForwarded", allQueueData.filter(item => item.status === "forwarded").length);
    setText("dashCompleted", allQueueData.filter(item => item.status === "completed").length);
    setText("dashDeferred", allQueueData.filter(item => item.status === "deferred").length);
    setText("dashPriority", allQueueData.filter(item => item.priority !== "regular" && 
        item.status !== "completed" && item.status !== "deferred").length);
}

/** Refreshes operator dashboard sync status message. */
function updateOperatorLastUpdated(message = null) {
    const el = document.getElementById("operatorLastUpdated");
    if (!el) return;

    if (message) {
        el.textContent = message;
        return;
    }

    el.textContent = `${new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
    })}`;
}

/** Formats difference duration into readable form. */
function formatOperatorTime(item) {
    if (item.status.toLowerCase() === "completed" || 
        item.status.toLowerCase() === "deferred" && item.completed_at) {
        const start = new Date(item.created_at);
        const end = new Date(item.completed_at);
        const diffMs = Math.max(0, end - start);
        const diffMins = Math.floor(diffMs / 60000);
        const diffSecs = Math.floor((diffMs % 60000) / 1000);
        return `${diffMins}m ${diffSecs}s`;
    }

    return new Date(item.created_at).toLocaleString();
}

/** Escapes text entities to prevent XSS issues. */
function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/* ================= UPDATE ENTRY ================= */

/** Opens update status code modal for queue items. */
async function updateEntry(id){
    document.getElementById("editNo").value = id;
    document.getElementById("updateModal").style.display = "flex";
}

document.querySelectorAll(".status-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".status-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById("updateStatus").value = btn.dataset.status;
    });
});

/** Submits updated status selection back to the database. */
async function saveStatusUpdate(){
    const id = parseInt(document.getElementById("editNo").value);
    const newStatus = document.getElementById("updateStatus").value;

    try {
        const response = await fetch(`${API_BASE}/status/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus })
        });

        if (!response.ok) {
            const errorData = await response.json();
            alert("Error: " + errorData.detail);
            return;
        }

        closeModal('updateModal');
        loadQueue();

    } catch (error) {
        console.error("Error updating status:", error);
        alert("Failed to connect to the server.");
    }
}

/* ================= ROW SELECTION ================= */

/** Sets visual selection highlight for the clicked queue row. */
function selectRow(id, rowElement){
    document.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
    rowElement.classList.add("selected");
    selectedEntryId = id;
    document.getElementById("editSelectedBtn").classList.add("show");
    document.getElementById("deleteSelectedBtn").classList.add("show");
    syncPanelButtonsForSelection();
    const flashBtn = document.getElementById("flashBtn");
    if (flashBtn) flashBtn.textContent = "Flash";
}

/** Clears visual selection and action states from table queue rows. */
function clearSelection(){
    selectedEntryId = null;
    togglePanelButtons();
    document.getElementById("editSelectedBtn").classList.remove("show");
    document.getElementById("deleteSelectedBtn")?.classList.remove("show");
    document.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
    const flashBtn = document.getElementById("flashBtn");
    if (flashBtn) flashBtn.textContent = "Flash Next";
    setPanelButtonState("flashBtn", true);
}

/** Dispatches flash action or next call based on selection state. */
async function handleFlashAction() {
    if (selectedEntryId) {
        await flashSelected();
    } else {
        await callNext();
    }
}

/** Calls the next pending queue item by updating its status to processing. */
async function callNext() {
    try {
        const response = await fetch(`${API_BASE}/call-next`, {
            method: "PUT"
        });

        if (!response.ok) {
            const errorData = await response.json();
            alert("No PENDING entries in the queue to flash.");
            return;
        }

        await loadQueue();
    } catch (error) {
        console.error("Error calling next queue:", error);
    }
}

/** Flashes the currently selected queue item by setting its status to processing. */
async function flashSelected() {
    try {
        const todayRes = await fetch(`${API_BASE}/today`);
        const queue = await todayRes.json();
        const item = queue.find(q => q.id === selectedEntryId);
        if(!item) return;

        await fetch(`${API_BASE}/status/${item.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({status: "processing"})
        });

        await loadQueue();
        clearSelection();
    } catch (error) {
        console.error("Error fetching item:", error);
    }
}

document.addEventListener("click", function(e){
    const isRow = e.target.closest("tr");
    const isSidebar = e.target.closest(".sidebar");
    const isModal = e.target.closest(".modal");
    const isPagination = e.target.closest(".pagination");
    const isQueuePanel = e.target.closest(".queue-panel");

    if(!isRow && !isSidebar && !isModal && !isPagination && !isQueuePanel){
        clearSelection();
        clearUserSelection();
    }
});

/** Opens the confirmation modal for deleting the selected queue item. */
async function deleteSelected(){
    try {
        const response = await fetch(`${API_BASE}/today`);
        const queue = await response.json();
        const item = queue.find(q => q.id === selectedEntryId);

        if(!item) return;

        document.getElementById("deleteModal").style.display = "flex";
    } catch (error) {
        console.error("Error fetching item:", error);
    }
}

/** Deletes the selected queue item from the database. */
async function deleteEntry(){
    const deletedId = selectedEntryId;
    try {
        const response = await fetch(`${API_BASE}/items/${deletedId}`, {
            method: "DELETE"
        });

        if (!response.ok) {
            const errorData = await response.json();
            alert("Error: " + errorData.detail);
            return;
        }

        closeModal('deleteModal');
        loadQueue();
        clearSelection();
    } catch (error) {
        console.error("Error deleting entry:", error);
        alert("Failed to connect to the server.");
    }
}

/** Cleans session info and routes user back to the login page. */
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
        localStorage.removeItem("userId");
        window.location.replace("../login/auth.html");
    } catch (error) {
        console.error("Error logging out:", error);
        alert("Failed to connect to the server.");
    }
}

/* COLLAPSING SIDEBAR */
const sidebar = document.querySelector(".sidebar");
const toggleBtn = document.getElementById("sidebarToggle");
toggleBtn.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
});

/** Returns the selected ticket back to pending status. */
async function skip(status) {
    try {
        const todayRes = await fetch(`${API_BASE}/today`);
        const queue = await todayRes.json();
        const item = queue.find(q => q.id === selectedEntryId);

        if (!item) {
            alert("Selected queue item not found.");
            return;
        }

        const response = await fetch(`${API_BASE}/status/${item.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "pending" })
        });

        if (!response.ok) {
            const errorData = await response.json();
            alert("Error: " + errorData.detail);
            return;
        }

        await loadQueue();
        clearSelection();
    } catch (error) {
        console.error("Error skipping queue:", error);
    }
}

/** Sets the status of the selected ticket to the given status parameter. */
async function updateCurrent(status) {
    try {
        const todayRes = await fetch(`${API_BASE}/today`);
        const queue = await todayRes.json();
        const item = queue.find(q => q.id === selectedEntryId);

        if (!item) {
            alert("Selected queue item not found.");
            return;
        }

        const itemStatus = item.status.toLowerCase();
        const targetStatus = status.toLowerCase();

        const response = await fetch(`${API_BASE}/status/${item.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: status })
        });

        if (!response.ok) {
            const errorData = await response.json();
            alert("Error: " + errorData.detail);
            return;
        }

        await loadQueue();
        clearSelection();
    } catch (error) {
        console.error(`Error setting status to ${status}:`, error);
    }
}

/* ================= USER LIST LOGIC ================= */

/** Locates and returns HTML user table control elements. */
function getUserPageElements() {
    const root = document.getElementById("userPage");
    if (!root) return {};
    
    return {
        lastUpdated: document.getElementById("userLastUpdated") || root.querySelector("#operatorLastUpdated"),
        totalUsers: document.getElementById("dashTotalUsers"),
        onlineUsers: document.getElementById("dashOnlineUsers"),
        searchInput: document.getElementById("userSearchInput") || root.querySelector("#searchInput"),
        divFilter: document.getElementById("userDivisionFilter") || root.querySelector("#divisionFilter"),
        tableBody: document.getElementById("userListBody") || root.querySelector("#queueBody"),
        table: document.getElementById("userTable") || root.querySelector("table")
    };
}

/** Fetches all user profiles from the API server database. */
async function loadUsers(resetPage = true) {
    try {
        const response = await fetch("../api/auth/users");
        if (!response.ok) {
            throw new Error(`Request failed: ${response.status} ${response.statusText}`);
        }

        const users = await response.json();
        if (!Array.isArray(users)) {
            throw new Error("Users API returned an unexpected response.");
        }

        allUserData = users;
        updateUserDashboard();
        updateUserLastUpdated();
        applyUserFilters(resetPage);
    } catch (error) {
        console.error("Error loading users:", error);
        renderUsersError("Failed to load user list.");
        updateUserLastUpdated("Unable to sync");
    }
}

/** Updates counters representing active total and online user profiles. */
function updateUserDashboard() {
    const els = getUserPageElements();
    const onlineUserCount = allUserData.filter(user => user.status === "online").length;
    if (els.totalUsers) {
        els.totalUsers.textContent = allUserData.length;
        els.onlineUsers.textContent = onlineUserCount;
    }
}

/** Updates last synced timestamp on the users administration view. */
function updateUserLastUpdated(message = null) {
    const els = getUserPageElements();
    if (!els.lastUpdated) return;

    if (message) {
        els.lastUpdated.textContent = message;
        return;
    }

    els.lastUpdated.textContent = `${new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
    })}`;
}

/** Triggers user profile search filters reset. */
function filterUsersTable() {
    applyUserFilters(true);
}

/** Filters user profile results using search fields. */
function applyUserFilters(resetPage = true) {
    const els = getUserPageElements();
    if (!els.searchInput || !els.divFilter) return;

    const search = els.searchInput.value.toLowerCase();
    const div = els.divFilter.value.toLowerCase();

    filteredUserData = allUserData.filter(user => {
        const text = `${user.id} ${user.name || ''} ${user.email || ''} ${user.division}`.toLowerCase();
        const matchSearch = !search || text.includes(search);
        const matchDiv = !div || (user.division && user.division.toLowerCase() === div);

        return matchSearch && matchDiv;
    });

    if (resetPage) {
        userCurrentPage = 1;
    }

    sortFilteredUsers();
    renderUsersTable();
}

/** Activates user profiles sorting flags based on selected header key. */
function sortUsersBy(key) {
    if (userSortKey === key) {
        userSortDirection = userSortDirection === "asc" ? "desc" : "asc";
    } else {
        userSortKey = key;
        userSortDirection = "asc";
    }

    userCurrentPage = 1;
    sortFilteredUsers();
    renderUsersTable();
}

/** Sorts the active users collection array. */
function sortFilteredUsers() {
    filteredUserData.sort((a, b) => {
        let valA = a[userSortKey];
        let valB = b[userSortKey];

        if (userSortKey === "created_at") {
            valA = valA ? new Date(valA).getTime() : 0;
            valB = valB ? new Date(valB).getTime() : 0;
        } else if (typeof valA === "string") {
            valA = valA.toLowerCase();
            valB = (valB || "").toLowerCase();
        } else {
            valA = valA ?? 0;
            valB = valB ?? 0;
        }

        if (valA < valB) return userSortDirection === "asc" ? -1 : 1;
        if (valA > valB) return userSortDirection === "asc" ? 1 : -1;
        return a.id - b.id;
    });
}

/** Populates rows in the administration user list table. */
function renderUsersTable() {
    const els = getUserPageElements();
    if (!els.tableBody) return;
    els.tableBody.innerHTML = "";

    const totalItems = filteredUserData.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / userRowsPerPage));

    // Clamp current page
    if (userCurrentPage > totalPages) userCurrentPage = totalPages;
    if (userCurrentPage < 1) userCurrentPage = 1;

    const startIdx = (userCurrentPage - 1) * userRowsPerPage;
    const endIdx = Math.min(startIdx + userRowsPerPage, totalItems);
    const pageData = filteredUserData.slice(startIdx, endIdx);

    // Update user page pagination controls
    const pageInfo = document.getElementById("userPageInfo");
    const prevPageBtn = document.getElementById("userPrevPageBtn");
    const nextPageBtn = document.getElementById("userNextPageBtn");
    const totalCount = document.getElementById("userTotalCount");

    if (pageInfo) pageInfo.textContent = `Page ${userCurrentPage} of ${totalPages}`;
    if (prevPageBtn) prevPageBtn.disabled = userCurrentPage <= 1;
    if (nextPageBtn) nextPageBtn.disabled = userCurrentPage >= totalPages;
    if (totalCount) totalCount.textContent = `${totalItems} user${totalItems !== 1 ? 's' : ''}`;

    // Enable/disable edit and delete buttons based on selection presence on the page
    const editBtn = document.getElementById("editUserBtn");
    const deleteBtn = document.getElementById("deleteUserBtn");
    const isAnySelected = selectedUserId !== null && pageData.some(u => u.id === selectedUserId);
    if (editBtn) editBtn.disabled = !isAnySelected;
    if (deleteBtn) deleteBtn.disabled = !isAnySelected;

    if (pageData.length === 0) {
        els.tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">No users found.</td>
            </tr>
        `;
        updateUserSortIcons();
        return;
    }

    pageData.forEach((user, index) => {
        const divClass = user.division ? user.division.toLowerCase().replace(/\s/g, '') : 'default';
        const formattedDate = user.created_at ? new Date(user.created_at).toLocaleString() : 'N/A';
        const isSelected = selectedUserId === user.id;
        const status = user.status.toUpperCase();
        const statusClass = user.status.toLowerCase() === "online" ? "status-online" : "status-offline";
        const lastSeenDate = user.last_seen ? new Date(user.last_seen).toLocaleString() : 'N/A';

        els.tableBody.innerHTML += `
        <tr class="${isSelected ? 'selected' : ''}" onclick="selectUserRow(${user.id}, this)">
            <td>${startIdx + index + 1}</td>
            <td><span class="status-badge ${statusClass}">${status}</span></td>
            <td>
                <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start; text-align: left;">
                    <span style="font-weight: 600; color: var(--text);">${escapeHtml(user.name || 'N/A')}</span>
                    <span style="font-size: 0.8rem; color: var(--muted);">${escapeHtml(user.email || 'N/A')}</span>
                </div>
            </td>
            <td><span class="div-badge ${divClass}">${escapeHtml((user.division || 'N/A').toUpperCase())}</span></td>
            <td>${formattedDate}</td>
            <td><span style="color: var(--muted); font-size: 0.85rem;">${lastSeenDate}</span></td>
        </tr>
        `;
    });

    updateUserSortIcons();
}

/** Renders fetch errors inside the users display table. */
function renderUsersError(message) {
    const els = getUserPageElements();
    if (els.tableBody) {
        els.tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">${message}</td>
            </tr>
        `;
    }
    const pageInfo = document.getElementById("userPageInfo");
    const prevPageBtn = document.getElementById("userPrevPageBtn");
    const nextPageBtn = document.getElementById("userNextPageBtn");
    const totalCount = document.getElementById("userTotalCount");

    if (pageInfo) pageInfo.textContent = "Page 1 of 1";
    if (prevPageBtn) prevPageBtn.disabled = true;
    if (nextPageBtn) nextPageBtn.disabled = true;
    if (totalCount) totalCount.textContent = "0 users";

    const editBtn = document.getElementById("editUserBtn");
    const deleteBtn = document.getElementById("deleteUserBtn");
    if (editBtn) editBtn.disabled = true;
    if (deleteBtn) deleteBtn.disabled = true;
}

/** Updates active sort flags on the admin users list headers. */
function updateUserSortIcons() {
    const els = getUserPageElements();
    if (!els.table) return;

    els.table.querySelectorAll(".sort-icon").forEach(icon => {
        icon.className = "sort-icon";
    });

    els.table.querySelectorAll("th.sortable").forEach(th => {
        th.classList.remove("active-asc", "active-desc");
    });

    const activeIcon = document.getElementById(`sort-icon-user-${userSortKey}`) || els.table.querySelector(`#sort-icon-${userSortKey}`);
    if (activeIcon) activeIcon.classList.add(userSortDirection);

    const activeHeader = els.table.querySelector(`th[data-key="${userSortKey}"]`);
    if (activeHeader) activeHeader.classList.add(`active-${userSortDirection}`);
}

/* ================= USER PAGINATION ================= */

/** Increments/decrements page navigation indices in the user panel. */
function changeUserPage(delta) {
    const totalPages = Math.max(1, Math.ceil(filteredUserData.length / userRowsPerPage));
    const newPage = userCurrentPage + delta;

    if (newPage >= 1 && newPage <= totalPages) {
        userCurrentPage = newPage;
        renderUsersTable();
    }
}

/** Resets row limits for paginated user lists. */
function changeUserRowsPerPage() {
    const selectEl = document.getElementById("userRowsPerPage");
    if (selectEl) {
        userRowsPerPage = parseInt(selectEl.value);
    }
    userCurrentPage = 1;
    renderUsersTable();
}

/* ================= USER SELECTION & MODAL ACTIONS ================= */

/** Selects a user row and highlights it in the admin UI view. */
function selectUserRow(id, rowElement) {
    const tableBody = document.getElementById("userListBody");
    if (tableBody) {
        tableBody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
    }
    rowElement.classList.add("selected");
    selectedUserId = id;

    const editBtn = document.getElementById("editUserBtn");
    const deleteBtn = document.getElementById("deleteUserBtn");
    if (editBtn) editBtn.disabled = false;
    if (deleteBtn) deleteBtn.disabled = false;
}

/** Deselects the highlighted user profile row. */
function clearUserSelection() {
    selectedUserId = null;
    const editBtn = document.getElementById("editUserBtn");
    const deleteBtn = document.getElementById("deleteUserBtn");
    if (editBtn) editBtn.disabled = true;
    if (deleteBtn) deleteBtn.disabled = true;

    const tableBody = document.getElementById("userListBody");
    if (tableBody) {
        tableBody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
    }
}

/** Sends a registration request to add a new operator user. */
async function registerNewUser(event) {
    event.preventDefault();

    const name = document.getElementById("regName").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const password = document.getElementById("regPassword").value;
    const division = document.getElementById("regDivision").value;

    const payload = {
        name: name,
        email: email,
        password: password,
        division: division
    };

    try {
        const response = await fetch("../api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            alert("Error: " + (errorData.detail || "Failed to register user."));
            return;
        }

        document.getElementById("userRegisterForm").reset();
        alert(`User ${name} registered successfully!`);
        closeModal('userRegisterModal');
        loadUsers(true); // reload users and reset to page 1
    } catch (error) {
        console.error("Error registering user:", error);
        alert("Failed to connect to the server.");
    }
}

/** Opens the modal form to modify selected user profile details. */
function openUserEditModal() {
    if (selectedUserId === null) return;
    const user = allUserData.find(u => u.id === selectedUserId);
    if (!user) return;

    document.getElementById("editUserId").value = user.id;
    document.getElementById("editName").value = user.name || "";
    document.getElementById("editEmail").value = user.email || "";
    document.getElementById("editPassword").value = "";
    document.getElementById("editDivision").value = user.division || "";
    document.getElementById("userEditModal").style.display = "flex";
}

/** Sends updated user info details to the server database. */
async function editExistingUser(event) {
    event.preventDefault();
    const id = document.getElementById("editUserId").value;
    const name = document.getElementById("editName").value.trim();
    const email = document.getElementById("editEmail").value.trim();
    const password = document.getElementById("editPassword").value;
    const division = document.getElementById("editDivision").value;

    const payload = {
        name: name,
        email: email,
        division: division
    };

    if (password) {
        payload.password = password;
    }

    try {
        const response = await fetch(`../api/auth/users/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            alert("Error: " + (errorData.detail || "Failed to update user."));
            return;
        }

        alert(`User ${name} updated successfully!`);
        closeModal('userEditModal');
        loadUsers(false); // Reload and preserve current page if possible
        clearUserSelection();
    } catch (error) {
        console.error("Error updating user:", error);
        alert("Failed to connect to the server.");
    }
}

/** Opens confirm user deletion dialog. */
function openUserDeleteModal() {
    if (selectedUserId === null) return;
    const user = allUserData.find(u => u.id === selectedUserId);
    if (!user) return;

    document.getElementById("deleteUserId").value = user.id;
    document.getElementById("deleteUserName").textContent = user.name || user.email;
    document.getElementById("userDeleteModal").style.display = "flex";
}

/** Requests deletion of selected user account from the server. */
async function deleteSelectedUser() {
    const id = document.getElementById("deleteUserId").value;

    try {
        const response = await fetch(`../api/auth/users/${id}`, {
            method: "DELETE"
        });

        if (!response.ok) {
            const errorData = await response.json();
            alert("Error: " + (errorData.detail || "Failed to delete user."));
            return;
        }

        alert("User deleted successfully!");
        closeModal('userDeleteModal');
        loadUsers(true); // Reload and reset to page 1
        clearUserSelection();
    } catch (error) {
        console.error("Error deleting user:", error);
        alert("Failed to connect to the server.");
    }
}

/** Removes DOM elements that the operator does not have access to based on their division. */
function applyDepartmentAccess() {                                                                                                      
    const userDiv = userDivision; // e.g., "admin", "lobby", "cashier"
    if (!userDiv) return;

    document.querySelectorAll("[data-allowed-div]").forEach(element => {
        const allowedDepts = element.dataset.allowedDiv
            .split(",")
            .map(d => d.trim().toLowerCase());

        if (!allowedDepts.includes(userDiv.toLowerCase())) {
            element.remove();
        }
    });
}
/* ================= CSV DOWNLOAD ================= */

/** Opens the CSV reports filter window. */
function openDownloadModal() {
    document.getElementById("csvTodayOnly").checked = false;
    document.getElementById("csvDateRange").classList.remove("hidden");
    document.getElementById("csvDateFrom").value = "";
    document.getElementById("csvDateTo").value = "";
    document.getElementById("downloadModal").style.display = "flex";
}

/** Toggle CSV timeframe select options. */
function toggleCsvDateRange() {
    const todayChecked = document.getElementById("csvTodayOnly").checked;
    const dateRange = document.getElementById("csvDateRange");

    if (todayChecked) {
        dateRange.classList.add("hidden");
    } else {
        dateRange.classList.remove("hidden");
    }
}

/** Wraps value fields in quotes for secure CSV construction. */
function escapeCsvValue(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
}

/** Measures milliseconds delta between transaction times. */
function computeServiceTimeMs(item) {
    if (!item.completed_at || !item.created_at) return -1;
    return new Date(item.completed_at).getTime() - new Date(item.created_at).getTime();
}

/** Translates transaction time to string representation. */
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

/** Formats ISO time values to local timezone layouts. */
function formatDatetime(isoStr) {
    if (!isoStr) return "—";
    const d = new Date(isoStr);
    const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
    return `${date}, ${time}`;
}

/** Triggers CSV transaction history downloads. */
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

/* ================= AUTO HTTP REFRESH ================= */

let pollingInterval = null;
let lastHeartbeat = 0;

/** Starts background sync polling interval processes. */
function startPolling() {
    if (pollingInterval) {
        return; // Prevent duplicate intervals
    }

    pollingInterval = setInterval(async () => {
        try {
            await loadQueue();
            if (userDivision && userDivision.toLowerCase() === "sadmin") {
                await loadUsers(false);
            }
            
            const now = Date.now();
            if (now - lastHeartbeat >= 5000) {
                lastHeartbeat = now;
                fetch("../api/auth/profile").catch(err => console.error("Heartbeat failed", err));
            }
        } catch (error) {
            console.error("Error refreshing data:", error);
        }
    }, 1000); // Every 1 second
}

window.addEventListener("load", () => {
    startPolling();
});
