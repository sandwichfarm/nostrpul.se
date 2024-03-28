import * as Tone from 'tone';

class ComplementaryToneGenerator {
  constructor() {
    // Array of root notes designed to be melodic
    
    this.rootNotes = ['C', 'E', 'G', 'B', 'D', 'F', 'A'];
    this.currentRootNoteIndex = 0; // Start with the first note in the array
    this.rootNote = this.rootNotes[this.currentRootNoteIndex];
    this.currentOctave = 4;
    this.scalePatterns = {
      major: [2, 2, 1, 2, 2, 2, 1],
      minor: [2, 1, 2, 2, 1, 2, 2],
      majorSeventh: [4, 3, 1],
      pentatonic: [2, 2, 3, 2, 3],
      blues: [3, 2, 1, 1, 3, 2],
      dorian: [2, 1, 2, 2, 2, 1, 2],
      mixolydian: [2, 2, 1, 2, 2, 1, 2],
      phrygian: [1, 2, 2, 2, 1, 2, 2],
      lydian: [2, 2, 2, 1, 2, 2, 1],
      harmonicMinor: [2, 1, 2, 2, 1, 3, 1],
      melodicMinor: [2, 1, 2, 2, 2, 2, 1],
      locrian: [1, 2, 2, 1, 2, 2, 2],
      diminished: [2, 1, 2, 1, 2, 1, 2, 1],
      wholeTone: [2, 2, 2, 2, 2, 2],
      minorPentatonic: [3, 2, 2, 3, 2],
      chromatic: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      ionian: [2, 2, 1, 2, 2, 2, 1],
      aeolian: [2, 1, 2, 2, 1, 2, 2],
      hungarianMinor: [2, 1, 3, 1, 1, 3, 1],
      neapolitanMinor: [1, 2, 2, 2, 1, 3, 1],
      neapolitanMajor: [1, 2, 2, 2, 2, 2, 1],
      enigmatic: [1, 3, 2, 2, 2, 1, 1],
      doubleHarmonic: [1, 3, 1, 2, 1, 3, 1],
      eightToneSpanish: [1, 2, 1, 1, 1, 2, 2, 2],
      lydianDominant: [2, 2, 2, 1, 2, 1, 2],
      superLocrian: [1, 2, 1, 2, 2, 2, 2],
      bebopMajor: [2, 2, 1, 2, 2, 1, 1, 1],
      bebopDominant: [2, 2, 1, 2, 2, 1, 2, 1],
      bebopMinor: [2, 1, 2, 2, 1, 2, 1, 1],
      japanese: [1, 4, 2, 1, 4],
      byzantine: [1, 3, 1, 2, 1, 3, 1],
      persian: [1, 3, 1, 1, 2, 3, 1],
      hindu: [2, 2, 1, 2, 1, 2, 2],
      algerian: [2, 1, 2, 1, 1, 1, 3, 1],
    };

    this.currentScalePatternIndex = 0;
    this.currentScalePattern = Object.keys(this.scalePatterns)[this.currentScalePatternIndex];
    this.currentScale = [];
    this.scaleIndex = -1; // Start before the first note to play the first note immediately
    this.direction = 1; // Start ascending
    this.notesSinceRootChange = 0
    this.randomRootChange = 0

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

  generateScale() {
    const pattern = this.scalePatterns[this.currentScalePattern];
    let scale = [];
    let currentNote = `${this.rootNote}${this.currentOctave}`; 
    scale.push(currentNote);

    for (let i = 0; i < pattern.length; i++) {
        currentNote = Tone.Frequency(currentNote).transpose(pattern[i]).toNote();
        scale.push(currentNote);
    }

    this.currentScale = scale;
}

  initializeScale() {
    this.reset()
    this.generateScale();
    this.scaleIndex = 0; // Start from the first note
  }

  playNextNote() {
    this.notesSinceRootChange++
    if(this.notesSinceRootChange > this.randomRootChange){
      this.selectNextScaleAndRoot()
    }
    if (this.direction === 1 && this.scaleIndex >= this.currentScale.length - 1 || this.direction === -1 && this.scaleIndex <= 0) {
      this.direction *= -1; // Change direction
    } else {
      this.scaleIndex += this.direction;
    }

    if (this.scaleIndex < 0 || this.scaleIndex >= this.currentScale.length) { // Ensures index stays within bounds
      return;
    }

    const nextNote = this.currentScale[this.scaleIndex];

    this.synth.triggerAttackRelease(nextNote, '8n');
  }

  selectNextScaleAndRoot() {
    this.reset()
    this.currentRootNoteIndex = (this.currentRootNoteIndex + 1) % this.rootNotes.length;
    this.rootNote = this.rootNotes[this.currentRootNoteIndex];

    const max = Object.keys(this.scalePatterns).length
    this.currentScalePatternIndex = Math.floor(Math.random() * (max - 0 + 1)) + 0;
    this.currentScalePattern = Object.keys(this.scalePatterns)[this.currentScalePatternIndex];

    this.initializeScale();
  }

  reset(){
    this.randomRootChange = Math.floor(Math.random() * (12 - 3 + 1)) + 3
    this.notesSinceRootChange = 0
  }
}

export default ComplementaryToneGenerator;
