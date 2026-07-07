const API_BASE = "../api/auth";

(async function() {                                                                                                           
            try {                                                                                                                     
                const response = await fetch("../api/auth/profile");                                                                    
                if (response.ok) {                                                                                                    
                    const data = await response.json();                                                                               
                    // If they are already authenticated, redirect them directly to their portal                                      
                    if (data.division === "lobby" || data.division === "sadmin") {                                                                                
                        window.location.replace("../operator/index.html");                                                              
                    } else {                                                                                                          
                        window.location.replace("../monitoring/index.html");                                                            
                    }                                                                                                                 
                }                                                                                                                     
            } catch (e) {
                // Ignore error since we want to fall back to showing the login form
            }
        })();

document.getElementById("loginForm").addEventListener("submit", async function(e) {                                               
    e.preventDefault(); // This stops the page from refreshing!                                                                   

const email = document.getElementById("emailField").value
const password = document.getElementById("passwordField").value
  
  const payload = {
    email: email,
    password: password
  };

  try {
      const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify(payload) 
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || 'Login failed');
    }

    localStorage.setItem("userDiv", data.user.division);
    localStorage.setItem("userId", data.user.id);
    if (data.user.division === "lobby" || data.user.division === "sadmin") {
        window.location.href = "../operator/index.html";
    } else {
        window.location.href = "../monitoring/index.html";
    }

  } catch (error) {
    console.error('Error:', error.message);
    alert(error.message);
  }
});
