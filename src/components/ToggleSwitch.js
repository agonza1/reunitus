import React, { useState } from 'react';
import './ToggleSwitch.css'; // Import your custom styles

const ToggleSwitch = ({ onToggle }) => {
  const [checked, setChecked] = useState(false);

  const handleClick = () => {
    const newChecked = !checked;
    setChecked(newChecked);
    // Call the onToggle callback function with the new checked state
    onToggle(newChecked);
  };

  return (
    <div className="toggle-container">
      <div
        className={`toggle-button ${checked ? 'checked' : ''}`}
        onClick={handleClick}
      >
        {checked ? 'TURN OFF' : 'TURN ON'}
      </div>
    </div>
  );
};

export default ToggleSwitch;