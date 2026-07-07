const API_BASE = "../api/queue";

const buttons = document.querySelectorAll(".priority-btn");
let priorityType = "regular";

// Toggle active states for priority selection
buttons.forEach(button => {
    button.addEventListener("click", () => {
        if (button.classList.contains("active")) {
            button.classList.remove("active");
        } else {
            buttons.forEach(btn => btn.classList.remove("active"));
            button.classList.add("active");
        }

        priorityType = document.querySelector(".priority-btn.active")?.dataset.value ?? "regular";
    });
});

// Custom Kiosk Modal logic
function showModal(title, message, isSuccess = true, queueNo = null) {
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

function closeModal() {
    document.getElementById("customModal").style.display = "none";
}

document.getElementById("modalCloseBtn").addEventListener("click", closeModal);

// Form submission handler
document.getElementById("entryForm")
.addEventListener("submit", async function (e) {
    e.preventDefault();

    const payload = {
        client_name: document.getElementById("nameField").value.trim(),
        purpose: document.getElementById("purposeField").value.trim(),
        division: "lobby",
        priority: priorityType
    };

    try {
        const cardsRes = await fetch(`${API_BASE}/available-cards`);
        if (!cardsRes.ok) {
            throw new Error("Unable to fetch available cards.");
        }
        const cardsData = await cardsRes.json();

        if (!cardsData.available_cards || cardsData.available_cards.length === 0) {
            showModal("No Cards Available", "All physical cards are currently in use. Please wait or proceed to the desk.", false);
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
            showModal("Submission Error", errorData.detail || "Unable to queue your ticket.", false);
            return;
        }

        const newItem = await response.json();
        showModal(
            "Ticket Generated!", 
            `Name: ${newItem.client_name}\n\nYou must get this queue number card from the front desk and wait to be called.`, 
            true,
            newItem.queue_no
        );
        resetPage();
    } catch (err) {
        console.error("Queue submission error:", err);
        showModal("Connection Error", "Could not connect to the queue system server. Please try again.", false);
    }
});

function resetPage() {
    document.getElementById("nameField").value = "";
    document.getElementById("purposeField").value = "";
    buttons.forEach(btn => btn.classList.remove("active"));
    priorityType = "regular";
}