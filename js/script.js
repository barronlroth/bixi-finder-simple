mapboxgl.accessToken = 'pk.eyJ1IjoiYmFycm9ubHJvdGgiLCJhIjoiY20wazFocDl6MDZrZjJqb2l6Nmo0MGM4NyJ9.nkdshe6uzb7BSWb0vXwevQ';
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v11',
    center: [-73.5857, 45.5235], // Montreal coordinates
    zoom: 13
});

let userLocation;
let updateInterval;
let countdown = 60;

function startUpdateCycle() {
    updateBixiInfo();
    updateInterval = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
            updateBixiInfo();
            countdown = 60;
        }
        updateTimer();
    }, 1000);
}

function updateTimer() {
    const timerElement = document.getElementById('timer');
    timerElement.textContent = `Next update in ${countdown} seconds`;
}

function updateBixiInfo() {
    if (userLocation) {
        findElectricBixis();
    }
}

function getUserLocationAndFindBixis() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(function(position) {
            userLocation = {
                lat: position.coords.latitude,
                lon: position.coords.longitude
            };
            findElectricBixis();
            startUpdateCycle();
        }, function(error) {
            console.error("Error getting user location:", error);
            alert("Unable to get your location. Please check your browser settings and try again.");
        });
    } else {
        alert("Geolocation is not supported by your browser. Using default Montreal location.");
        userLocation = { lat: 45.5235, lon: -73.5857 }; // Default to Montreal
        findElectricBixis();
        startUpdateCycle();
    }
}

async function findElectricBixis() {
    const result = document.getElementById('result');
    result.textContent = 'Loading...';
    result.className = 'mt-4 text-lg text-gray-700 animate-pulse';

    try {
        // Fetch the GBFS feeds
        const response = await fetch('https://gbfs.velobixi.com/gbfs/gbfs.json');
        const data = await response.json();

        // Get the station information URL
        const stationInfoUrl = data.data.en.feeds.find(feed => feed.name === 'station_information').url;

        // Fetch station information
        const stationInfoResponse = await fetch(stationInfoUrl);
        const stationInfo = await stationInfoResponse.json();

        // Get the station status URL
        const stationStatusUrl = data.data.en.feeds.find(feed => feed.name === 'station_status').url;

        // Fetch station status
        const stationStatusResponse = await fetch(stationStatusUrl);
        const stationStatus = await stationStatusResponse.json();

        // Find nearby stations with bikes
        const nearbyStations = stationInfo.data.stations
            .filter(station => calculateDistance(userLocation, station) <= 0.5) // Within 0.5 km
            .map(station => {
                const status = stationStatus.data.stations.find(s => s.station_id === station.station_id);
                return {
                    ...station,
                    num_ebikes_available: status ? status.num_ebikes_available : 0,
                    num_bikes_available: status ? status.num_bikes_available : 0
                };
            });

        const totalElectricBikes = nearbyStations.reduce((sum, station) => sum + station.num_ebikes_available, 0);
        const totalRegularBikes = nearbyStations.reduce((sum, station) => sum + station.num_bikes_available, 0);

        result.textContent = `There are ${totalElectricBikes} electric and ${totalRegularBikes} regular Bixis available within 0.5 km of your location.`;
        result.className = 'mt-4 text-lg text-gray-700';

        // Clear existing markers
        document.querySelectorAll('.mapboxgl-marker').forEach(marker => marker.remove());

        // Add markers for nearby stations with bikes
        nearbyStations.forEach(station => {
            if (station.num_ebikes_available > 0 || station.num_bikes_available > 0) {
                // Create a custom marker element
                const el = document.createElement('div');
                let bgColor;
                if (station.num_ebikes_available === 0) {
                    bgColor = 'bg-gray-500'; // Gray for no electric bikes
                } else if (station.num_ebikes_available === 1) {
                    bgColor = 'bg-yellow-500'; // Yellow for 1 electric bike
                } else {
                    bgColor = 'bg-blue-500'; // Blue for 2 or more electric bikes
                }
                el.className = `flex items-center justify-center w-8 h-8 rounded-full ${bgColor} text-white font-bold border-2 border-white`;
                el.innerHTML = station.num_ebikes_available;
                el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';

                const marker = new mapboxgl.Marker(el)
                    .setLngLat([station.lon, station.lat])
                    .setPopup(new mapboxgl.Popup().setHTML(`
                        <h3 class="font-bold text-lg mb-2">${station.name}</h3>
                        <p class="mb-1">Electric bikes available: ${station.num_ebikes_available}</p>
                        <p class="mb-2">Regular bikes available: ${station.num_bikes_available}</p>
                        <button onclick="navigate(${station.lat}, ${station.lon})" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
                            Navigate
                        </button>
                    `))
                    .addTo(map);
            }
        });

        // Add marker for user's location
        new mapboxgl.Marker({ color: '#e24a4a' })
            .setLngLat([userLocation.lon, userLocation.lat])
            .setPopup(new mapboxgl.Popup().setHTML('<h3>Your Location</h3>'))
            .addTo(map);

        // Fit map to show all markers
        const bounds = new mapboxgl.LngLatBounds();
        nearbyStations.forEach(station => bounds.extend([station.lon, station.lat]));
        bounds.extend([userLocation.lon, userLocation.lat]);
        map.fitBounds(bounds, { padding: 50 });

    } catch (error) {
        result.textContent = 'Error fetching data. Please try again later.';
        result.className = 'mt-4 text-lg text-red-600';
        console.error('Error:', error);
    }
}

function calculateDistance(point1, point2) {
    const R = 6371; // Earth's radius in km
    const dLat = (point2.lat - point1.lat) * Math.PI / 180;
    const dLon = (point2.lon - point1.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function navigate(lat, lon) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=walking`;
    window.open(url, '_blank');
}