class SpeedTest {
    constructor() {
        this.startBtn = document.querySelector('.start-btn');
        this.stopBtn = document.querySelector('.stop-btn');
        this.restartBtn = document.querySelector('.restart-btn');
        this.themeBtn = document.querySelector('.theme-btn');
        this.downloadValue = document.querySelector('.download .speed-value');
        this.uploadValue = document.querySelector('.upload .speed-value');
        this.pingValue = document.querySelector('.ping .speed-value');
        this.serverLocation = document.querySelector('.server-location');
        
        this.testFile = 'https://cdn.jsdelivr.net/npm/speedtest-files@1.0.0/100MB.zip';
        this.running = false;
        this.measurements = {
            download: [],
            upload: [],
            ping: []
        };

        this.chunkSize = 1024 * 1024; // 1MB chunks for download test
        this.lastSpeedUpdate = 0;
        this.speedUpdateInterval = 200; // Update speed every 200ms

        // Initialize theme
        this.theme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', this.theme);
        this.updateThemeIcon();

        // Initialize chart
        this.initChart();
        
        // Event listeners
        this.startBtn.addEventListener('click', () => this.startTest());
        this.stopBtn.addEventListener('click', () => this.stopTest());
        this.restartBtn.addEventListener('click', () => this.restartTest());
        this.themeBtn.addEventListener('click', () => this.toggleTheme());
        
        this.initializeServerInfo();
    }

    initChart() {
        const ctx = document.getElementById('speedChart').getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Download (Mbps)',
                    borderColor: '#2196F3',
                    data: []
                }, {
                    label: 'Upload (Mbps)',
                    borderColor: '#4CAF50',
                    data: []
                }, {
                    label: 'Ping (ms)',
                    borderColor: '#FFC107',
                    data: []
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 0
                },
                scales: {
                    x: {
                        type: 'linear',
                        display: true,
                        title: {
                            display: true,
                            text: 'Time (s)'
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Speed'
                        }
                    }
                }
            }
        });
    }

    toggleTheme() {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', this.theme);
        localStorage.setItem('theme', this.theme);
        this.updateThemeIcon();
    }

    updateThemeIcon() {
        const icon = this.themeBtn.querySelector('i');
        icon.className = this.theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }

    formatSpeed(speed, isLatency = false) {
        if (isLatency) {
            return Math.round(speed);
        }
        
        // Handle invalid or zero speed
        if (!speed || isNaN(speed) || speed < 0) {
            return "0.00";
        }
        
        if (speed < 1) {
            // For speeds less than 1 Mbps, show 2 decimal places
            return speed.toFixed(2);
        }
        if (speed < 10) {
            // For speeds between 1 and 10 Mbps, show 1 decimal place
            return speed.toFixed(1);
        }
        // For speeds >= 10 Mbps, show whole numbers
        return Math.round(speed);
    }

    updateValue(element, value, isLatency = false) {
        const formattedValue = this.formatSpeed(value, isLatency);
        if (element.textContent !== formattedValue) {
            element.textContent = formattedValue;
            element.classList.add('updating');
            setTimeout(() => element.classList.remove('updating'), 500);
        }
    }

    async measureSpeed(type) {
        if (type === 'ping') {
            while (this.running) {
                const startTime = performance.now();
                try {
                    await fetch(this.testFile + '?r=' + Math.random(), { method: 'HEAD' });
                    const pingTime = performance.now() - startTime;
                    this.updateValue(this.pingValue, pingTime, true);
                } catch (error) {
                    console.error('Ping measurement failed:', error);
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } else if (type === 'download') {
            this.measureDownload();
        } else if (type === 'upload') {
            while (this.running) {
                try {
                    const blob = new Blob([new ArrayBuffer(2 * 1024 * 1024)]); // 2MB file
                    const startTime = performance.now();
                    
                    await new Promise((resolve, reject) => {
                        const xhr = new XMLHttpRequest();
                        xhr.upload.onprogress = (event) => {
                            if (event.lengthComputable && this.running) {
                                const duration = (performance.now() - startTime) / 1000;
                                const speed = (event.loaded * 8) / duration / 1000000; // Mbps
                                this.updateValue(this.uploadValue, speed);
                            }
                        };
                        xhr.onload = resolve;
                        xhr.onerror = reject;
                        xhr.open('POST', 'https://httpbin.org/post');
                        xhr.send(blob);
                    });
                } catch (error) {
                    console.error('Upload measurement failed:', error);
                }
            }
        }
    }

    async measureDownload() {
        while (this.running) {
            try {
                const startTime = performance.now();
                let totalBytes = 0;
                let lastUpdateTime = startTime;
                let lastBytes = 0;

                const response = await fetch(this.testFile + '?r=' + Math.random());
                const reader = response.body.getReader();

                while (true) {
                    const { done, value } = await reader.read();
                    
                    if (done || !this.running) {
                        reader.cancel();
                        break;
                    }

                    totalBytes += value.length;
                    const now = performance.now();
                    const updateInterval = now - lastUpdateTime;

                    // Update speed every 200ms
                    if (updateInterval >= this.speedUpdateInterval) {
                        const bytesInInterval = totalBytes - lastBytes;
                        const intervalInSeconds = updateInterval / 1000;
                        
                        // Calculate speed for this interval
                        const currentSpeed = (bytesInInterval * 8) / intervalInSeconds / 1000000;
                        
                        // Apply smoothing using exponential moving average
                        const smoothedSpeed = this.smoothSpeed(currentSpeed);
                        
                        this.updateValue(this.downloadValue, smoothedSpeed);
                        
                        lastUpdateTime = now;
                        lastBytes = totalBytes;
                    }
                }

                // Calculate final average speed
                const totalTime = (performance.now() - startTime) / 1000;
                const averageSpeed = (totalBytes * 8) / totalTime / 1000000;
                
                // If the test is still running, start a new measurement after a short delay
                if (this.running) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

            } catch (error) {
                console.error('Download measurement failed:', error);
                if (this.running) {
                    // Wait before retrying on error
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
    }

    smoothSpeed(newSpeed) {
        // Use exponential moving average for smoother updates
        if (!this.lastSpeed) {
            this.lastSpeed = newSpeed;
        }
        const alpha = 0.2; // Smoothing factor (0-1)
        this.lastSpeed = (alpha * newSpeed) + ((1 - alpha) * this.lastSpeed);
        return this.lastSpeed;
    }

    updateChart(timestamp) {
        const seconds = Math.floor((Date.now() - this.startTime) / 1000);
        
        this.chart.data.labels.push(seconds);
        this.chart.data.datasets[0].data.push(parseFloat(this.downloadValue.textContent));
        this.chart.data.datasets[1].data.push(parseFloat(this.uploadValue.textContent));
        this.chart.data.datasets[2].data.push(parseFloat(this.pingValue.textContent));

        // Keep only last 30 seconds of data
        if (this.chart.data.labels.length > 30) {
            this.chart.data.labels.shift();
            this.chart.data.datasets.forEach(dataset => dataset.data.shift());
        }

        this.chart.update();
    }

    startTest() {
        if (this.running) return;
        
        this.running = true;
        this.startTime = Date.now();
        this.startBtn.disabled = true;
        this.stopBtn.disabled = false;
        this.restartBtn.disabled = false;

        // Start all measurements simultaneously
        this.measureSpeed('download');
        this.measureSpeed('upload');
        this.measureSpeed('ping');

        // Start chart updates
        this.chartUpdateInterval = setInterval(() => this.updateChart(), 1000);
    }

    stopTest() {
        this.running = false;
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        clearInterval(this.chartUpdateInterval);
    }

    restartTest() {
        this.stopTest();
        this.downloadValue.textContent = '0';
        this.uploadValue.textContent = '0';
        this.pingValue.textContent = '0';
        
        // Reset chart
        this.chart.data.labels = [];
        this.chart.data.datasets.forEach(dataset => dataset.data = []);
        this.chart.update();
        
        this.startTest();
    }

    async initializeServerInfo() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            const locationResponse = await fetch(`https://ipapi.co/${data.ip}/json/`);
            const locationData = await locationResponse.json();
            this.serverLocation.textContent = `${locationData.city}, ${locationData.country_name}`;
        } catch (error) {
            this.serverLocation.textContent = 'Local Server';
        }
    }
}

// Initialize the speed test when the page loads
window.addEventListener('load', () => {
    new SpeedTest();
});
