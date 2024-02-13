export function generateBackground(event) {
  if(!event) return
  const dTag = event.tags.find(tag => tag[0] === 'd');
  return dTag ? generateColorFromTag(dTag[1]) : '#defaultColor';
}

export function generateColorFromTag(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash &= hash; // Convert to 32bit integer
  }

  let color = '#';
  for (let i = 0; i < 3; i++) {
      let value = (hash >> (i * 8)) & 255;
      // Normalize the value to get a pastel color
      value = (value % 128) + 127; // Ensure the color is always light
      color += ('00' + value.toString(16)).substr(-2);
  }
  return color;
}