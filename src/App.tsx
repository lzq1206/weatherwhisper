import React, { useState } from 'react';
import ClimateMap from './components/ClimateMap';
import ClimateDashboard from './components/ClimateDashboard';
import TimeSlider from './components/TimeSlider';

function App() {
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState<number>(3); // Set default to March

  return (
    <div className="App w-full h-full relative">
      <ClimateMap 
        selectedStation={selectedStation} 
        setSelectedStation={setSelectedStation}
        currentMonth={currentMonth}
      />
      
      <TimeSlider 
        currentMonth={currentMonth} 
        onChange={setCurrentMonth} 
      />

      {selectedStation && (
        <ClimateDashboard 
          stationId={selectedStation} 
          onClose={() => setSelectedStation(null)} 
        />
      )}
    </div>
  );
}

export default App;
