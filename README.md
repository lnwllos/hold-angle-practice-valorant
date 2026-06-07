# Valorant Hold-Angle Trainer

FPS บน browser สำหรับซ้อม **Hold angle**: ยืนนิ่ง pre-aim มุม แล้ว react ตอนศัตรู swing ออกจาก cover. Damage และ physics อ้างอิงจาก Valorant. ไม่ต้อง install และไม่มี build step.

## วิธีรัน
- **ดับเบิลคลิก `index.html`** - เล่น offline ได้ เพราะ vendored Three.js อยู่ในโปรเจกต์แล้ว
- หรือรัน **`start.bat`** เพื่อเปิดที่ http://localhost:8000

คลิกหน้าจอเพื่อเล่น ระบบจะจับเมาส์ด้วย pointer lock. กด **Esc** เพื่อเปิด Settings หรือ pause. คลิกซ้ายเพื่อยิง มีกระสุนไม่จำกัดและไม่ต้อง reload.

ทุกนัดจะเล่นเสียง Vandal, วาด tracer ที่ค่อย ๆ จางใน 1 วินาที และให้ timing feedback: ยิงเร็วไปถ้ากระสุนผ่านหน้าก่อน bot, ยิงช้าไปถ้าผ่านหลัง bot, และยิงเป๊ะถ้าโดนใกล้กลางหัว. Headshot ที่อยู่นอกจุดกลางจะแสดงว่าเกือบเร็วหรือเกือบช้าตามฝั่งของหัว.

## สิ่งที่จำลองจาก Valorant
- ความเร็ว peek/swing ของศัตรู **5.4 m/s** เท่ากับความเร็ววิ่งตอนถือ Vandal/rifle
- **Vandal**: หัว **160** - headshot นัดเดียวตายทุกระยะ ไม่มี falloff; body **40** ต้อง 4 นัด; legs **33**. ศัตรูมี **150 EHP** (100 HP + 50 armor)
- Fire rate **9.75 rounds/sec** และ horizontal **FOV 103°**
- ศัตรูซ่อนหลังมุม และจะ visible เมื่อ strafe พ้น edge เท่านั้น

## Settings (Esc)
- **ระยะ** player ถึง enemy: ใกล้ 8m / กลาง 18m / ไกล 35m
- **โหมดฝึก**: *Hold angle* สำหรับ react ตอน enemy peek; *Wall peek* สำหรับซ่อนหลังกำแพงแล้วใช้ **WASD** ออกไป clear bot 1-5 ตัว จากนั้นถอยกลับ cover เพื่อ spawn wave ถัดไป; *Smoke* สำหรับยืนหลัง smoke ที่บังเต็มประมาณ 3s แล้วค่อย fade เพื่อ reveal bot 1-5 ตัว
- **จำนวนเป้า** ใน peek mode: คงที่ หรือสุ่ม 1-5 ตัว. Bot ยืนสุ่มตำแหน่งด้านหน้า สุ่มซ้าย/ขวาและความลึก แต่ไม่เกินระยะที่ตั้งไว้ และไม่ยิงสวน
- **โหมด Peek**: ระยะคงที่ หรือสุ่มโดยที่ **peek กว้างจะออกยากกว่า**
- **ฝั่ง Peek**: ซ้าย / ขวา / สุ่ม
- **โหมดดีเลย์ Spawn**: respawn delay คงที่ (default 0.5s) หรือสุ่มด้วย min/max
- **Respawn ตอน full peek**: เริ่ม delay รอบถัดไปเมื่อ bot ปัจจุบัน peek จนสุดระยะที่ตั้งไว้
- **First bullet drill** ใน Hold mode: อนุญาตหนึ่ง valid shot ต่อ peek. ถ้า miss หรือโดน body รอบจะจบทันที เพื่อแยกซ้อมวินัยนัดแรก
- **Feedback ทิศทาง miss** ใน Hold mode: แสดง ซ้าย / ขวา / สูง / ต่ำ หลัง valid miss และแสดง รอก่อน / ไม่มีเป้า สำหรับ trigger discipline
- **ฝึก Flash**: เปิด **Breach (Flashpoint)**, **Phoenix (Curveball)**, **Yoru (Blindside)** และ flash แบบยิงทำลายได้. เมื่อเปิดอย่างน้อยหนึ่งตัว **ความถี่ Flash** จะกำหนดโอกาสที่ spawn ถัดไปเป็น flash round: flash จะออกจาก angle ด้วย windup และ blind duration ตาม agent; หันหนีเพื่อลด blind แล้ว enemy จะ peek ต่อ. **เสียง Flash** เปิด/ปิด cue windup/pop
- **Flash ที่ยิงทำลายได้** ใน Hold mode: มี 2 แบบที่ยิงเพื่อ cancel blind ได้ และใช้ pool เดียวกับ Flash frequency
- **Eye Blind Orb**: orb เรืองแสงออกจากมุมและลอยค้าง ถ้าไม่ทำลายด้วย 2 hits ก่อน arm จะทำ nearsight (vignette มืด + blur; ของใกล้ยังเห็น ไม่ใช่ white-out). เป็น drill flick-and-destroy
- **Tracking Blind Drone**: scanner บินออกจากหลังกำแพงและ aim scan cone มาที่ player; ถ้า lock-on สำเร็จจะยิง blind แรง. ต้อง track และทำลายด้วย 2 hits ก่อนยิง blind
- ยิง flash แบบทำลายได้แล้วจะมี hitmarker; ถ้าทำลายก่อน blind = สำเร็จ ไม่มี blind แล้ว enemy จะ peek. Visual เป็น placeholder ของโปรเจกต์ ไม่ใช่ชื่อหรือ asset official
- **รีเซ็ตสถิติ**: ปุ่มด้านบนของ Settings
- **Sensitivity**: ค่า Valorant sens + Mouse DPI พร้อม cm/360 โดยประมาณ และ fine-tune multiplier เพื่อจูนให้ตรงมือ. Browser รายงาน mouse movement เป็น pixel ไม่ใช่ raw DPI count ดังนั้น cm/360 เป็นค่าประมาณ
- **Recoil Vandal**: เปิด/ปิด + intensity. นัดแรกแม่นเสมอ
- **Crosshair**: สี, ความยาว, gap, ความหนา, center dot. Settings ทั้งหมดบันทึกใน localStorage
- **อัด Log**: เมื่อเปิด จะบันทึก tick aim/player แบบเบา ๆ และ event รายละเอียด เช่น `spawn`/`visible`/`wave-spawn`/`target-spawn`/`shot`/`kill`/`flash`/`blind`/`round-end`/`stop`. ปิดเพื่อ download ไฟล์ `holdangle-log-*.json` หนึ่งไฟล์ต่อ session สำหรับ AI-assisted analysis ด้าน aim, flick, recoil และ sensitivity

Log schema v2 ใช้ profile 64 Hz, ใส่ ID ให้ round/wave/target และเก็บ shot context: yaw/pitch error แบบ signed, target head/distance, time since visible, time since last shot, first-bullet flag, burst index, recoil offset, player speed, wall-block status, valid-shot metrics และ shot reason ที่อ่านง่าย. Summary สุดท้ายจะนับจากตอนเริ่มอัดจริง ไม่รวมการเล่นก่อนเริ่มอัด. ถ้าเปลี่ยน Settings/mode หรือ reset stats ระหว่างอัด จะมี `config`/`reset-stats` event และแยก segment summary. ถ้า bot จบรอบเพราะ full peek หรือ First bullet drill จะมี `round-end`; ตอนหยุดอัดจะมี `stop` เพื่อไม่ให้ log ดูเหมือนค้างกลาง event. ระบบ auto-stop และ download เมื่อถึง safety cap ประมาณ 10 นาที.

HUD แสดง **Kill, valid-shot accuracy, first-bullet accuracy, raw accuracy, headshot %, no-target shots, early shots, average reaction time** และเวลา session. Reaction time คือเวลาจาก enemy clear มุมจนถึง killing shot.

## Develop / test
Pure game logic เช่น damage, peek sampling, sensitivity, fire-rate, recoil, stats และ FOV มี unit test ด้วย Node runner:

```bash
node --test tests/constants.test.js tests/logic.test.js
```

## โครงไฟล์
```text
index.html       overlay + ลำดับ script tag
three.min.js     Three.js r128 แบบ vendored
js/constants.js  ค่า reference จาก Valorant + FOV helper
js/logic.js      pure game logic
js/scene.js      renderer, กล้อง FOV-103, environment
js/player.js     pointer lock + mouse look + sensitivity + gated WASD movement
js/effects.js    sound effect ยิง/kill + bullet tracer
js/enemy.js      peeking bot พร้อม hitbox head/body/legs
js/bot.js        geometry bot ที่ใช้ร่วมกัน
js/targets.js    bot แบบนิ่งใน peek mode + wave
js/peekmode.js   wall/smoke cover + wave state machine
js/flash.js      practice flash ต่อ agent
js/eyeorb.js     Eye Blind Orb ที่ยิงทำลายได้
js/trackdrone.js Tracking Blind Drone ที่บิน/scan/lock-on
js/weapon.js     Vandal hitscan, damage, fire-rate, recoil, wall occlusion
js/hud.js        crosshair + stats overlay
js/settings.js   settings panel + persistence
js/recorder.js   aim log recorder + JSON export
js/game.js       composition root + spawn/hold/respawn state machine
```
