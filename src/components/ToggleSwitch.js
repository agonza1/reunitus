import React, { useState } from 'react';
import './ToggleSwitch.css'; // Import your custom styles

const ToggleSwitch = () => {
  const [checked, setChecked] = useState(false);

  const handleClick = () => {
    setChecked(!checked);
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