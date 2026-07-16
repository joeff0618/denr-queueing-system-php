/**
 * Updates the display element with the current date (DD MONTH YYYY) and time (HH:MM AM/PM) every second.
 */
function updateClock() {
      const now = new Date();

      // Format date: DD MONTH YYYY
      const months = [
        'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
        'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
      ];
      const day = String(now.getDate()).padStart(2, '0');
      const month = months[now.getMonth()];
      const year = now.getFullYear();
      document.getElementById('date-display').textContent = `${day} ${month} ${year}`;

      // Format time: HH:MM AM/PM
      let hours = now.getHours();
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours === 0 ? 12 : hours;
      const hoursStr = String(hours).padStart(2, '0');

      document.getElementById('time-display').innerHTML =
        `${hoursStr}:${minutes}<span class="ampm" id="ampm-display">${ampm}</span>`;
    }

    // Run immediately and then every second
    updateClock();
    setInterval(updateClock, 1000);
    
    // Tracker for items that triggers the chime
    let chimedItems = new Set();

/**
 * Updates the TV monitor dashboard displaying Now Serving and Coming Up Next information.
 * Handles chime playing and text-to-speech announcement of newly called queue items.
 * 
 * @param {Array} activeItems List of active queue items fetched from the server.
 */
function updateDisplay(activeItems) {
  // Clear current displays
  document.getElementById('queue-body-regular-smd').innerHTML = '';
  document.getElementById('queue-body-sr-smd').innerHTML = '';
  document.getElementById('queue-body-lpdd').innerHTML = '';
  document.getElementById('queue-body-a0504').innerHTML = '';
  document.getElementById('sidebar-in-queue').innerHTML = '';
  document.getElementById('sidebar-priority').innerHTML = '';
  document.getElementById('office-body').innerHTML = '';

  // Default header if no office divisions are currently processing
  const officeHeader = document.getElementById('office-header');
  if (officeHeader) officeHeader.innerText = 'OFFICE';

  const mainDivisions = ['smd', 'lpdd', 'a0504'];
  const isOfficeDivision = (div) => {
      const d = div.toLowerCase();
      return !['smd', 'r-smd', 'sr-smd', 'lpdd', 'a0504'].includes(d);
  };

  // Track the absolute next pending item across all divisions (priority items first)
  let absoluteNextPending = null;

  // Iterate through active items and place them in the correct column
  activeItems.forEach(item => {
      if (item.status === 'processing') {
          const lowerDiv = item.division.toLowerCase();

          if(!chimedItems.has(item.id)) {
            const audio = new Audio('../assets/sound/Announcement sound effect (128kbit_AAC).m4a');
            audio.play().catch(e => console.log(e));

            setTimeout(() => {
                const utterance = new SpeechSynthesisUtterance(`Number ${item.queue_no}, please proceed to the front desk.`);
                window.speechSynthesis.speak(utterance);
            }, 3000);
            chimedItems.add(item.id);
          }
        
          if (isOfficeDivision(lowerDiv)) {
              // Show item in the top office announcement area - PREPENDED
              document.getElementById('office-body').innerHTML = `
                <div class="queue-item now-serving">
                  <span class="now-serving-label">NOW SERVING</span>
                  ${item.queue_no}
                </div>
              ` + document.getElementById('office-body').innerHTML;
              
              // Change the "OFFICE" text to the division name
              if (officeHeader) {
                  officeHeader.innerText = item.division.toUpperCase();
              }

          } else {
              // Post to specific division columns (SMD, LPDD, CASHIER)
              let depBodyId = `queue-body-${lowerDiv}`;
              if (lowerDiv === 'smd' || lowerDiv === 'r-smd' || lowerDiv === 'sr-smd') {
                  if (lowerDiv === 'r-smd') {
                      depBodyId = 'queue-body-regular-smd';
                  } else if (lowerDiv === 'sr-smd') {
                      depBodyId = 'queue-body-sr-smd';
                  } else {
                      depBodyId = item.priority === 'regular' ? 'queue-body-regular-smd' : 'queue-body-sr-smd';
                  }
              }
              const depBody = document.getElementById(depBodyId);
              
              if (depBody) {
                  // Prepend to the first of the box instead of appending
                  depBody.innerHTML = `
                    <div class="queue-item now-serving">
                      <span class="now-serving-label">NOW SERVING</span>
                      ${item.queue_no}
                    </div>
                  ` + depBody.innerHTML;
              }
          }
      } else if (item.status === 'pending') {
          // Remove from chimed items so it can chime again if called to process again
          chimedItems.delete(item.id);

          const lowerDiv = item.division.toLowerCase();

          // Track the overall next pending item (priority first, then chronological)
          if (!absoluteNextPending) {
              absoluteNextPending = item;
          } else if (item.priority !== 'regular' && absoluteNextPending.priority === 'regular') {
              // Priority items take precedence
              absoluteNextPending = item;
          }

          if (item.priority !== 'regular') {
              document.getElementById('sidebar-priority').innerHTML += `<div class="sidebar-item priority">${item.queue_no}</div>`;
          } else {
              document.getElementById('sidebar-in-queue').innerHTML += `<div class="sidebar-item">${item.queue_no}</div>`;
          }
      }
  });

  // Add "Coming up next" for the single absolute next pending division
  if (absoluteNextPending) {
      const lowerDiv = absoluteNextPending.division.toLowerCase();
      if (lowerDiv === 'smd' || lowerDiv === 'r-smd' || lowerDiv === 'sr-smd') {
          let subDiv = '';
          if (lowerDiv === 'r-smd') {
              subDiv = 'regular-smd';
          } else if (lowerDiv === 'sr-smd') {
              subDiv = 'sr-smd';
          } else {
              subDiv = absoluteNextPending.priority === 'regular' ? 'regular-smd' : 'sr-smd';
          }
          const depBody = document.getElementById(`queue-body-${subDiv}`);
          if (depBody) {
              depBody.innerHTML += `
                <div class="coming-up-next">
                  Coming Up Next: <strong>${absoluteNextPending.queue_no}</strong>
                </div>
              `;
          }
      } else if (mainDivisions.includes(lowerDiv)) {
          const depBody = document.getElementById(`queue-body-${lowerDiv}`);
          if (depBody) {
              depBody.innerHTML += `
                <div class="coming-up-next">
                  Coming Up Next: <strong>${absoluteNextPending.queue_no}</strong>
                </div>
              `;
          }
      } else if (isOfficeDivision(lowerDiv)) {
          document.getElementById('office-body').innerHTML += `
            <div class="coming-up-next">
              Coming up next... <strong>${absoluteNextPending.queue_no}</strong>
            </div>
          `;
      }
  }

  // Set the dynamic layout classes based on child counts
  const bodyIds = ['queue-body-regular-smd', 'queue-body-sr-smd', 'queue-body-lpdd', 'queue-body-a0504', 'office-body'];
  bodyIds.forEach(id => {
      const body = document.getElementById(id);
      if (body) {
          const nowServingCount = body.querySelectorAll('.queue-item.now-serving').length;
          body.classList.remove('count-1', 'count-2', 'count-3', 'count-4');
          if (nowServingCount === 1) {
              body.classList.add('count-1');
          } else if (nowServingCount === 2) {
              body.classList.add('count-2');
          } else if (nowServingCount === 3) {
              body.classList.add('count-3');
          } else if (nowServingCount >= 4) {
              body.classList.add('count-4');
          }
      }
  });
}

let currentAnnouncement = "";

// Reloads the queue data every second
setInterval(() => {
  fetch("../api/queue/active")
  .then(r => r.json())
  .then(data => {
      updateDisplay(data);
  })
  .catch(err => console.error("Error fetching queue data:", err));

  fetch("../api/queue/announcement")
  .then(r => r.json())
  .then(data => {
      const msg = data.message;
      const annArea = document.getElementById("announcement-area");
      const daArea = document.getElementById("datetime-announcement-area");

      if (msg && msg.trim() !== "") {
          document.getElementById("announcement-body").textContent = msg;
          annArea.style.display = "flex";
          daArea.style.gridTemplateRows = "1fr 2fr";

          if (currentAnnouncement !== msg) {
              const audio = new Audio('../assets/sound/Announcement sound effect (128kbit_AAC).m4a');
            audio.play().catch(e => console.log(e));
              currentAnnouncement = msg;
          }
      } else {
          annArea.style.display = "none";
          daArea.style.gridTemplateRows = "1fr";
          currentAnnouncement = "";
      }
  })
  .catch(err => console.error("Error fetching announcement:", err));
}, 1000);

// Unlock Audio & SpeechSynthesis on overlay click
const overlay = document.getElementById('audio-unlock-overlay');
if (overlay) {
    overlay.addEventListener('click', () => {
        try {
            const utterance = new SpeechSynthesisUtterance('');
            window.speechSynthesis.speak(utterance);
            
            // Play a silent audio to unlock AudioContext
            const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==');
            audio.play().catch(e => console.log(e));
            
            console.log("Audio Context and SpeechSynthesis unlocked successfully!");
        } catch (e) {
            console.warn(e);
        }
        overlay.style.display = 'none';
    });
}