window.NEXUS_PROJECTS = [
  {
    id: "proj-lfr-esp32",
    title: "LINE FOLLOWING ROBOT PROJECT",
    category: "Robotics & UAV",
    price: "FREE NOW · LIST PRICE ৳100",
    thumbnail: "https://raw.githubusercontent.com/twinklwtiny-star/B2C/refs/heads/main/Gemini_Generated_Image_wk314mwk314mwk31.jpg",
    circuit: "https://raw.githubusercontent.com/twinklwtiny-star/B2C/refs/heads/main/Gemini_Generated_Image_j72oeuj72oeuj72o.jpg",
    youtube: "https://youtu.be/dgZWO_tDyHA",
    firmwarePath: "/data/line-following-robot.ino",
    description: `A 13-sensor TCRT5000 line-following robot built around an ESP32. The system uses an analog multiplexer to scan the sensor array, an H-bridge motor driver to control two N20 DC gear motors, and a 128 × 64 SSD1306 OLED display for menus and running status. Five tactile push buttons control the menu and settings. The firmware includes weighted sensor-position calculation, PID-style proportional and derivative correction, lost-line recovery, adjustable speed/threshold/Kp/Kd settings, and EEPROM persistence.

IMPORTANT FIRMWARE PIN MAP
The supplied firmware defines: OLED SDA GPIO 21 / SCL GPIO 22; multiplexer SIG GPIO 34, S0 GPIO 25, S1 GPIO 26, S2 GPIO 27, S3 GPIO 14; motor IN1 GPIO 4, IN2 GPIO 16, IN3 GPIO 5, IN4 GPIO 2, ENA GPIO 17, ENB GPIO 15; buttons UP 32, DOWN 33, LEFT 18, RIGHT 19, MIDDLE 23. SENSOR_COUNT is 13, so channels 0–12 are scanned.

WIRING CONFLICT WARNING
The original written wiring notes specify a different pin map from the firmware. Do not combine the written notes and firmware pins. The sketch does not define a STBY pin. Verify the actual motor-driver model, board labels and voltage ratings before connecting power.`,
    aiContext: `You are the NEXUS engineering assistant. Explain the ESP32 line follower in clear student-friendly language. The firmware scans 13 analog sensor readings from multiplexer channels 0–12, compares each with sensorThreshold, uses weights 100, 200, …, 1300, calculates a weighted position with target 700, and applies PID-style correction (Kp, Ki and Kd; supplied defaults include Ki=0). Line-loss recovery uses lastError. Settings are stored using EEPROM. The OLED shows menus/status. Five buttons use INPUT_PULLUP and read LOW when pressed.

CRITICAL: written wiring notes conflict with current firmware. Firmware pins: OLED SDA 21/SCL 22; mux SIG 34, S0 25, S1 26, S2 27, S3 14; motor IN1 4, IN2 16, IN3 5, IN4 2, ENA 17, ENB 15; buttons UP 32, DOWN 33, LEFT 18, RIGHT 19, MIDDLE 23. The written wiring notes separately state mux S0–S3 16/17/18/19, mux SIG 34/35, motor ENA 25, AIN1/AIN2 26/27, BIN1/BIN2 32/33, ENB 4, and STBY 3.3V/GPIO. The sketch does not define STBY. Never mix the pin maps. Do not assume the driver model or claim the wiring has been validated.`,
    codeSummary: `ESP32 line follower firmware is provided as a separate .ino file. The firmware shown in that file is the source supplied with the original portal. Check the pin-map conflict warning in the project description before wiring.`
  }
];
