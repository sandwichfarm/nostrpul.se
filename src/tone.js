import * as Tone from 'tone';

class ComplementaryToneGenerator {
  constructor() {
    this.rootNote = 'C';
    this.currentOctave = 4; // Starting octave
    this.octaveDirection = 1; // 1 for up, -1 for down
    this.octaveMin = 3; // Minimum octave limit
    this.octaveMax = 5; // Maximum octave limit
    this.scalePatterns = {
      major: [2, 2, 1, 2, 2, 2, 1], // W-W-H-W-W-W-H
      minor: [2, 1, 2, 2, 1, 2, 2], // W-H-W-W-H-W-W
      majorSeventh: [4, 3, 1], // Major 7th Chord (Root-Major 3rd-Perfect 5th-Major 7th)
      pentatonic: [2, 2, 3, 2, 3], // Pentatonic Scale
    };
    this.scaleKeys = Object.keys(this.scalePatterns);
    this.currentScalePatternIndex = 0; // Index to keep track of the current scale pattern
    this.currentScalePattern = this.scaleKeys[this.currentScalePatternIndex];
    this.currentScale = [];
    this.scaleIndex = 0;
    this.lastFrequency = null;

    this.synth = new Tone.Synth({
      envelope: {
        attack: 0.005,
        decay: 0.1,
        sustain: 0.1,
        release: 0.5,
      },
    }).toDestination();

    this.initializeScale();
  }

  generateScale(rootNote, pattern) {
    let scale = [`${rootNote}${this.currentOctave}`];
    let currentFrequency = Tone.Frequency(scale[0]).toFrequency();
    
    pattern.forEach(interval => {
      currentFrequency *= Tone.intervalToFrequencyRatio(interval);
      scale.push(Tone.Frequency(currentFrequency).toNote());
    });

    return scale;
  }

  initializeScale() {
    this.currentScale = this.generateScale(this.rootNote, this.scalePatterns[this.currentScalePattern]);
    this.scaleIndex = 0; // Reset scale index
  }

  playNextNote() {
    // Check if we've reached the end or start of the scale to change direction
    if (this.scaleIndex >= this.currentScale.length - 1 || this.scaleIndex <= 0) {
      this.adjustOctaveAndMaybeScale();
    }

    const nextNote = this.currentScale[this.scaleIndex];
    this.synth.triggerAttackRelease(nextNote, '8n', Tone.now());
    this.scaleIndex += this.octaveDirection; // Move index in the current direction
    this.lastFrequency = Tone.Frequency(nextNote).toFrequency();
  }

  adjustOctaveAndMaybeScale() {
    // When changing direction at octave limits, also change the scale
    if (this.currentOctave >= this.octaveMax || this.currentOctave <= this.octaveMin) {
      this.octaveDirection *= -1; // Change direction
      this.selectNextScaleAndRoot(); // Change scale and root note
    } else if (this.scaleIndex === 0 || this.scaleIndex === this.currentScale.length - 1) {
      // Regular octave direction change without hitting octave limits
      this.octaveDirection *= -1; // Change direction
    }

    // Adjust the octave within the limits
    this.currentOctave += this.octaveDirection;
    if (this.currentOctave > this.octaveMax) {
      this.currentOctave = this.octaveMax;
    } else if (this.currentOctave < this.octaveMin) {
      this.currentOctave = this.octaveMin;
    }

    this.initializeScale(); // Re-initialize the scale with the new settings
  }

  selectNextScaleAndRoot() {
    // Move to the next scale pattern
    this.currentScalePatternIndex = (this.currentScalePatternIndex + 1) % this.scaleKeys.length;
    this.currentScalePattern = this.scaleKeys[this.currentScalePatternIndex];

    const rootNotes = ['C', 'D', 'E', 'B', 'G', 'F', 'A'];
    let currentRootIndex = rootNotes.indexOf(this.rootNote);
    currentRootIndex = (currentRootIndex + 1) % rootNotes.length;
    this.rootNote = rootNotes[currentRootIndex];
  }
}

export default ComplementaryToneGenerator;
