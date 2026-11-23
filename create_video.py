import os
import glob
from moviepy.video.io.ImageSequenceClip import ImageSequenceClip
from moviepy.audio.io.AudioFileClip import AudioFileClip
from moviepy.video.compositing.CompositeVideoClip import CompositeVideoClip
from moviepy.video.VideoClip import VideoClip
from PIL import Image
import numpy as np

# Configuration
images_dir = '/home/user/videocreation/images'
audio_path = '/home/user/videocreation/audio/ad_voiceover.mp3'
output_path = '/home/user/videocreation/video/ad_video_1min.mp4'

# 1. Load images and sort them numerically
image_files = sorted(glob.glob(os.path.join(images_dir, '*.jpeg')), key=lambda x: int(os.path.basename(x).split('.')[0]))

# 2. Calculate duration per image (60 seconds total / 16 images = 3.75s each)
duration_per_image = 60.0 / len(image_files)

# Resize images and prepare list for ImageSequenceClip
resized_paths = []
for img_path in image_files:
    img = Image.open(img_path)
    img = img.resize((1920, 1080))
    resized_path = img_path + '_resized.jpg'
    img.save(resized_path, 'JPEG')
    resized_paths.append(resized_path)

# Create video clip from images
video_clip = ImageSequenceClip(resized_paths, durations=[duration_per_image]*len(resized_paths))

# 3. Add motion graphics (simple fade-in/fade-out overlay clips)
# Create a white overlay for fade-in (0-3s)
def make_fade_in_frame(t):
    opacity = 0.5 * (1 - t/3.0)
    frame = np.full((1080, 1920, 3), 255, dtype=np.uint8)
    return (frame * opacity).astype(np.uint8)
fade_in_clip = VideoClip(frame_function=make_fade_in_frame, duration=3.0)

# Create a white overlay for fade-out (57-60s)
def make_fade_out_frame(t):
    opacity = 0.5 * (t/3.0)
    frame = np.full((1080, 1920, 3), 255, dtype=np.uint8)
    return (frame * opacity).astype(np.uint8)
fade_out_clip = VideoClip(frame_function=make_fade_out_frame, duration=3.0)

# Position them in time
fade_in_clip = fade_in_clip.with_start(0)
fade_out_clip = fade_out_clip.with_start(57.0)

# Composite video
final_video = CompositeVideoClip([video_clip, fade_in_clip, fade_out_clip])

# 4. Add audio
audio_clip = AudioFileClip(audio_path)
# Ensure audio length matches video (trim or pad)
# Since the audio is ~15s and video is 60s, let's just repeat the audio clip 4 times manually using concatenate_audioclips
# Let's use a simpler approach: just repeat the audio clip using a loop in the lambda
# Actually, let's just trim the audio if longer, and if shorter, we'll just let it end (though the prompt says 1 min video, audio is ~15s).
# Wait, the prompt says "need 1 minute long video. Add voice and motion graphics".
# The voiceover is ~15s. If we just let it end, the video will be silent for the rest.
# Let's pad the audio with silence to make it 60s long.
from moviepy.audio.AudioClip import AudioClip
# Create silence clip
silence = AudioClip(frame_function=lambda t: np.array([0.0]), duration=final_video.duration - audio_clip.duration)
# Concatenate audio_clip and silence manually using a new AudioClip
def make_padded_audio_frame(t):
    if t < audio_clip.duration:
        return audio_clip.get_frame(t)
    else:
        return np.array([0.0])

padded_audio = AudioClip(frame_function=make_padded_audio_frame, duration=final_video.duration)

final_video = final_video.with_audio(padded_audio)

# 5. Write video
final_video.write_videofile(output_path, fps=24, codec='libx264', audio_codec='aac')

print(f"Video successfully created at {output_path}")
