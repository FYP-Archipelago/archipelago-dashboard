import Icon from './Icon.tsx';

export default function Unavailable() {
  return (
    <span className="unavailable">
      <Icon name="cloudOff" size={14} />
      Currently Unavailable
    </span>
  );
}
