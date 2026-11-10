# 키와 버튼: 화면마다 하는 일

전환 그래프의 1단계 입력(각 상태의 첫 포커스에서 누른 모든 키)에서 뽑았습니다. 빈칸은 아무 일도 없었다는 뜻입니다.

## 키보드

### 입력마다

#### Esc

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| play:running | → play:paused |  |  |  |
| select+options:rules | → select | 닫기 | 닫기 Esc | 브라우저 기본 동작 남음 |
| select+search | → select |  |  |  |
| select+add | → select | 닫기 |  | 브라우저 기본 동작 남음 |
| settings:speed | → select | 완료 | 완료 Esc |  |
| play:paused | → play:running |  | 계속하기 Esc |  |
| result | → select |  |  |  |
| select+options:generation | → select | 닫기 | 닫기 Esc | 브라우저 기본 동작 남음 |
| select+options:gear | → select | 닫기 | 닫기 Esc | 브라우저 기본 동작 남음 |
| select+options:rules+search | → select+options:rules | 닫기 | 닫기 Esc |  |
| select+options:rules+add | → select+options:rules | 닫기 | 닫기 Esc | 브라우저 기본 동작 남음 |
| select+info+search | → select+info | 닫기 | 닫기 Esc |  |
| select+info+add | → select+info | 닫기 | 닫기 Esc | 브라우저 기본 동작 남음 |
| select+add+search | → select+add | 닫기 |  |  |
| settings:judge | → select | 완료 | 완료 Esc |  |
| settings:gear | → select | 완료 | 완료 Esc |  |
| settings:advanced | → select | 완료 | 완료 Esc |  |
| settings:pad | → select | 완료 | 완료 Esc |  |
| settings:keys | → select | 완료 | 완료 Esc |  |
| settings:sound | → select | 완료 | 완료 Esc |  |
| settings:fx | → select | 완료 | 완료 Esc |  |
| settings:notes | → select | 완료 | 완료 Esc |  |
| settings:play | → select | 완료 | 완료 Esc |  |
| result:details | → result | 상세 닫기 |  |  |
| select+options:generation+search | → select+options:generation | 닫기 | 닫기 Esc |  |
| select+options:generation+add | → select+options:generation | 닫기 | 닫기 Esc | 브라우저 기본 동작 남음 |
| select+options:gear+search | → select+options:gear | 닫기 | 닫기 Esc |  |
| select+options:gear+add | → select+options:gear | 닫기 | 닫기 Esc | 브라우저 기본 동작 남음 |
| calibration:input | → settings:judge | 돌아가기 | 돌아가기 Esc |  |
| calibration:visual | → settings:judge | 돌아가기 | 돌아가기 Esc |  |
| settings:pad+capture | → settings:pad | 취소 | 완료 Esc | 브라우저 기본 동작 남음 |
| settings:keys+capture | → settings:keys | 취소 | 완료 Esc |  |
| calibration:input+running | → calibration:input | 멈추기 | 돌아가기 Esc |  |
| select+first+search | → select+first |  |  |  |
| select+first+add | → select+first | 닫기 |  | 브라우저 기본 동작 남음 |
| select+first+add+search | → select+first+add | 닫기 |  |  |
| select+offline+info | → select+offline | 닫기 | 닫기 Esc | 브라우저 기본 동작 남음 |
| select+offline+search | → select+offline |  |  |  |
| select+offline+options:rules | → select+offline | 닫기 | 닫기 Esc | 브라우저 기본 동작 남음 |
| select+offline+info+search | → select+offline+info | 닫기 | 닫기 Esc |  |
| select+offline+options:generation | → select+offline | 닫기 | 닫기 Esc | 브라우저 기본 동작 남음 |
| select+offline+options:gear | → select+offline | 닫기 | 닫기 Esc | 브라우저 기본 동작 남음 |
| select+offline+options:rules+search | → select+offline+options:rules | 닫기 | 닫기 Esc |  |
| select+offline+options:generation+search | → select+offline+options:generation | 닫기 | 닫기 Esc |  |
| select+offline+options:gear+search | → select+offline+options:gear | 닫기 | 닫기 Esc |  |
| select+info+youtube | → select+info | 닫기 | 닫기 Esc | 브라우저 기본 동작 남음 |
| select+info+analysis+search | → select+info+analysis | 닫기 | 닫기 Esc |  |
| select+info+youtube+add | → select+info+add | 닫기 | 닫기 Esc | 브라우저 기본 동작 남음 |
| select+info+analysis+add | → select+info+analysis | 닫기 | 닫기 Esc | 브라우저 기본 동작 남음 |
| select+info+youtube+search | → select+info+youtube | 닫기 | 닫기 Esc |  |
| select+info+youtube+analysis | → select | 닫기 | 닫기 Esc | 브라우저 기본 동작 남음 |
| select+info+analysis | → select | 닫기 | 닫기 Esc | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis+search | → select+info+youtube+analysis | 닫기 | 닫기 Esc |  |
| select+info+youtube+analysis+add | → select+info+youtube+analysis | 닫기 | 닫기 Esc | 브라우저 기본 동작 남음 |

#### Enter

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → play:running | 플레이 | 플레이 Enter |  |
| select+options:rules | → play:running | 플레이 | 플레이 Enter |  |
| select+search | → select | 플레이 | 플레이 Enter |  |
| select+add | → select | 고르기 | 플레이 Enter | 브라우저 기본 동작 남음 |
| play:paused | → play:running |  | Enter 건너뛰기 | 브라우저 기본 동작 남음 |
| result | → select | 선곡으로 | 선곡으로 Enter | 브라우저 기본 동작 남음 |
| select+options:generation | → play:running | 플레이 | 플레이 Enter |  |
| select+options:gear | → play:running | 플레이 | 플레이 Enter |  |
| select+options:rules+search | → select+options:rules | 플레이 | 플레이 Enter |  |
| select+options:rules+add | → select+options:rules | 고르기 | 플레이 Enter | 브라우저 기본 동작 남음 |
| select+info+search | → select+info | 플레이 | 플레이 Enter |  |
| select+info+add | → select+info | 고르기 | 플레이 Enter | 브라우저 기본 동작 남음 |
| select+add+search | → select+add | 고르기 | 플레이 Enter |  |
| settings:judge | 설정 judgementMode | 열기 |  |  |
| settings:gear | 설정 parts |  |  |  |
| settings:advanced |  | 누르기 |  | 브라우저 기본 동작 남음 |
| settings:pad |  | 지정 |  | 브라우저 기본 동작 남음 |
| settings:keys |  | 바꾸기 |  | 브라우저 기본 동작 남음 |
| result:details | → select | 선곡으로 | 선곡으로 Enter | 브라우저 기본 동작 남음 |
| select+options:generation+search | → select+options:generation | 플레이 | 플레이 Enter |  |
| select+options:generation+add | → select+options:generation | 고르기 | 플레이 Enter | 브라우저 기본 동작 남음 |
| select+options:gear+search | → select+options:gear | 플레이 | 플레이 Enter |  |
| select+options:gear+add | → select+options:gear | 고르기 | 플레이 Enter | 브라우저 기본 동작 남음 |
| calibration:input | → calibration:input+running | 시작 |  | 브라우저 기본 동작 남음 |
| calibration:visual | 화면 바뀜 | 저장 | 저장 Enter | 브라우저 기본 동작 남음 |
| select+first |  | 누르기 |  |  |
| select+first+search | → select+first |  |  |  |
| select+first+add | → select+first | 고르기 |  | 브라우저 기본 동작 남음 |
| select+first+add+search | → select+first+add | 고르기 |  |  |
| select+offline |  | 누르기 |  |  |
| select+offline+search | → select+offline | 누르기 |  |  |
| select+offline+info+search | → select+offline+info |  |  |  |
| select+offline+options:rules+search | → select+offline+options:rules |  |  |  |
| select+offline+options:generation+search | → select+offline+options:generation |  |  |  |
| select+offline+options:gear+search | → select+offline+options:gear |  |  |  |
| select+info+youtube |  | 플레이 | 플레이 Enter | 브라우저 기본 동작 남음 |
| select+info+analysis+search | → select+info+analysis | 플레이 | 플레이 Enter |  |
| select+info+youtube+add |  | 고르기 | 플레이 Enter | 브라우저 기본 동작 남음 |
| select+info+analysis+add | → select+info+analysis | 고르기 | 플레이 Enter | 브라우저 기본 동작 남음 |
| select+info+youtube+search | → select+info+youtube | 플레이 | 플레이 Enter |  |
| select+info+youtube+analysis | → select+info+youtube | 누르기 | 플레이 Enter |  |
| select+info+analysis | 화면 바뀜 | 플레이 | 플레이 Enter |  |
| select+info+youtube+analysis+search | → select+info+youtube+analysis | 플레이 | 플레이 Enter |  |
| select+info+youtube+analysis+add | → select+info+youtube+analysis | 고르기 | 플레이 Enter | 브라우저 기본 동작 남음 |

#### Space

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → select+options:rules | 플레이 옵션 |  |  |
| select+options:rules | → select | 플레이 옵션 닫기 |  |  |
| select+search | 화면 바뀜 | 플레이 옵션 |  | 브라우저 기본 동작 남음 |
| select+add |  | 플레이 옵션 |  | 브라우저 기본 동작 남음 |
| play:paused | → play:running |  |  | 브라우저 기본 동작 남음 |
| result | → result:details | 상세 | 상세 Space |  |
| select+options:generation | → select | 플레이 옵션 닫기 |  |  |
| select+options:gear | → select | 플레이 옵션 닫기 |  |  |
| select+options:rules+search | 화면 바뀜 | 플레이 옵션 닫기 |  | 브라우저 기본 동작 남음 |
| select+options:rules+add |  | 플레이 옵션 닫기 |  | 브라우저 기본 동작 남음 |
| select+info+search | 화면 바뀜 | 플레이 옵션 |  | 브라우저 기본 동작 남음 |
| select+info+add |  | 플레이 옵션 |  | 브라우저 기본 동작 남음 |
| select+add+search | 화면 바뀜 | 플레이 옵션 |  | 브라우저 기본 동작 남음 |
| result:details | → result | 상세 닫기 | 상세 Space |  |
| select+options:generation+search | 화면 바뀜 | 플레이 옵션 닫기 |  | 브라우저 기본 동작 남음 |
| select+options:generation+add |  | 플레이 옵션 닫기 |  | 브라우저 기본 동작 남음 |
| select+options:gear+search | 화면 바뀜 | 플레이 옵션 닫기 |  | 브라우저 기본 동작 남음 |
| select+options:gear+add |  | 플레이 옵션 닫기 |  | 브라우저 기본 동작 남음 |
| calibration:input | → calibration:input+running |  |  | 브라우저 기본 동작 남음 |
| calibration:visual | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+first | → select+options:rules | 플레이 옵션 |  |  |
| select+first+search | 화면 바뀜 | 플레이 옵션 |  | 브라우저 기본 동작 남음 |
| select+first+add |  | 플레이 옵션 |  | 브라우저 기본 동작 남음 |
| select+first+add+search | 화면 바뀜 | 플레이 옵션 |  | 브라우저 기본 동작 남음 |
| select+offline+info | → select+offline+options:rules | 플레이 옵션 |  |  |
| select+offline+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:rules | → select+offline | 플레이 옵션 닫기 |  |  |
| select+offline+info+search | 화면 바뀜 | 플레이 옵션 |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation | → select+offline | 플레이 옵션 닫기 |  |  |
| select+offline+options:gear | → select+offline | 플레이 옵션 닫기 |  |  |
| select+offline+options:rules+search | 화면 바뀜 | 플레이 옵션 닫기 |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation+search | 화면 바뀜 | 플레이 옵션 닫기 |  | 브라우저 기본 동작 남음 |
| select+offline+options:gear+search | 화면 바뀜 | 플레이 옵션 닫기 |  | 브라우저 기본 동작 남음 |
| select+info+youtube | 화면 바뀜 | 플레이 옵션 |  | 브라우저 기본 동작 남음 |
| select+info+analysis+search | 화면 바뀜 | 플레이 옵션 |  | 브라우저 기본 동작 남음 |
| select+info+youtube+add | 화면 바뀜 | 플레이 옵션 |  | 브라우저 기본 동작 남음 |
| select+info+analysis+add |  | 플레이 옵션 |  | 브라우저 기본 동작 남음 |
| select+info+youtube+search | 화면 바뀜 | 플레이 옵션 |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis | → select+options:rules | 플레이 옵션 |  |  |
| select+info+analysis | → select+options:rules | 플레이 옵션 |  |  |
| select+info+youtube+analysis+search | 화면 바뀜 | 플레이 옵션 |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis+add |  | 플레이 옵션 |  | 브라우저 기본 동작 남음 |

#### Tab

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 설정 lastKeyMode | 키 모드 | 4K4K+FX5K6K6K+FX7K+1S8KTab |  |
| select+options:rules | 설정 lastKeyMode |  | 4K4K+FX5K6K6K+FX7K+1S8KTab |  |
| select+search | → select | 키 모드 | 4K4K+FX5K6K6K+FX7K+1S8KTab | 브라우저 기본 동작 남음 |
| select+add | 포커스 → demo-button | 키 모드 | 4K4K+FX5K6K6K+FX7K+1S8KTab | 브라우저 기본 동작 남음 |
| settings:speed | 포커스 → opt-sudden |  |  | 브라우저 기본 동작 남음 |
| play:paused | 포커스 → pause-menu>button[1]:다시 하기 R |  |  | 브라우저 기본 동작 남음 |
| result | 포커스 → result-retry |  |  | 브라우저 기본 동작 남음 |
| select+options:generation | 설정 lastKeyMode |  | 4K4K+FX5K6K6K+FX7K+1S8KTab |  |
| select+options:gear | 설정 lastKeyMode |  | 4K4K+FX5K6K6K+FX7K+1S8KTab |  |
| select+options:rules+search | → select+options:rules |  | 4K4K+FX5K6K6K+FX7K+1S8KTab | 브라우저 기본 동작 남음 |
| select+options:rules+add | 포커스 → demo-button |  | 4K4K+FX5K6K6K+FX7K+1S8KTab | 브라우저 기본 동작 남음 |
| select+info+search | → select+info |  | 4K4K+FX5K6K6K+FX7K+1S8KTab | 브라우저 기본 동작 남음 |
| select+info+add | 포커스 → demo-button |  | 4K4K+FX5K6K6K+FX7K+1S8KTab | 브라우저 기본 동작 남음 |
| select+add+search | → select+add | 키 모드 | 4K4K+FX5K6K6K+FX7K+1S8KTab | 브라우저 기본 동작 남음 |
| settings:judge | 포커스 → opt-input-offset |  |  | 브라우저 기본 동작 남음 |
| settings:gear | 포커스 → opt-hud-type |  |  | 브라우저 기본 동작 남음 |
| settings:advanced | 포커스 → opt-display-mode |  |  | 브라우저 기본 동작 남음 |
| settings:pad | 포커스 → settings-tab-advanced |  |  | 브라우저 기본 동작 남음 |
| settings:keys | 포커스 → settings-tab-pad |  |  | 브라우저 기본 동작 남음 |
| settings:sound | 포커스 → settings-tab-keys |  |  | 브라우저 기본 동작 남음 |
| settings:fx | 포커스 → settings-tab-sound |  |  | 브라우저 기본 동작 남음 |
| settings:notes | 포커스 → settings-tab-fx |  |  | 브라우저 기본 동작 남음 |
| settings:play | 포커스 → settings-tab-judge |  |  | 브라우저 기본 동작 남음 |
| result:details | 포커스 → result-retry |  |  | 브라우저 기본 동작 남음 |
| select+options:generation+search | → select+options:generation |  | 4K4K+FX5K6K6K+FX7K+1S8KTab | 브라우저 기본 동작 남음 |
| select+options:generation+add | 포커스 → demo-button |  | 4K4K+FX5K6K6K+FX7K+1S8KTab | 브라우저 기본 동작 남음 |
| select+options:gear+search | → select+options:gear |  | 4K4K+FX5K6K6K+FX7K+1S8KTab | 브라우저 기본 동작 남음 |
| select+options:gear+add | 포커스 → demo-button |  | 4K4K+FX5K6K6K+FX7K+1S8KTab | 브라우저 기본 동작 남음 |
| calibration:input | 포커스 → calib-next |  |  | 브라우저 기본 동작 남음 |
| calibration:visual | 포커스 → calib-back |  |  | 브라우저 기본 동작 남음 |
| select+first | 설정 lastKeyMode | 키 모드 |  |  |
| select+first+search | → select+first | 키 모드 |  | 브라우저 기본 동작 남음 |
| select+first+add | 포커스 → demo-button | 키 모드 |  | 브라우저 기본 동작 남음 |
| select+first+add+search | → select+first+add | 키 모드 |  | 브라우저 기본 동작 남음 |
| select+offline | 설정 lastKeyMode |  |  |  |
| select+offline+info | 설정 lastKeyMode |  |  |  |
| select+offline+search | → select+offline |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:rules | 설정 lastKeyMode |  |  |  |
| select+offline+info+search | → select+offline+info |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation | 설정 lastKeyMode |  |  |  |
| select+offline+options:gear | 설정 lastKeyMode |  |  |  |
| select+offline+options:rules+search | → select+offline+options:rules |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation+search | → select+offline+options:generation |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:gear+search | → select+offline+options:gear |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube | 포커스 → bga-youtube-form>button[0]:취소 |  | 4K4K+FX5K6K6K+FX7K+1S8KTab | 브라우저 기본 동작 남음 |
| select+info+analysis+search | → select+info+analysis |  | 4K4K+FX5K6K6K+FX7K+1S8KTab | 브라우저 기본 동작 남음 |
| select+info+youtube+add | 포커스 → bga-youtube-form>button[0]:취소 |  | 4K4K+FX5K6K6K+FX7K+1S8KTab | 브라우저 기본 동작 남음 |
| select+info+analysis+add | 포커스 → demo-button |  | 4K4K+FX5K6K6K+FX7K+1S8KTab | 브라우저 기본 동작 남음 |
| select+info+youtube+search | → select+info+youtube |  | 4K4K+FX5K6K6K+FX7K+1S8KTab | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis | 설정 lastKeyMode |  | 4K4K+FX5K6K6K+FX7K+1S8KTab |  |
| select+info+analysis | 설정 lastKeyMode |  | 4K4K+FX5K6K6K+FX7K+1S8KTab |  |
| select+info+youtube+analysis+search | → select+info+youtube+analysis |  | 4K4K+FX5K6K6K+FX7K+1S8KTab | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis+add | 포커스 → demo-button |  | 4K4K+FX5K6K6K+FX7K+1S8KTab | 브라우저 기본 동작 남음 |

#### Shift+Tab

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 설정 lastKeyMode |  |  |  |
| select+options:rules | 설정 lastKeyMode |  |  |  |
| select+search | → select |  |  | 브라우저 기본 동작 남음 |
| select+add | 포커스 → add-menu |  |  | 브라우저 기본 동작 남음 |
| settings:speed | 포커스 → settings-tab-advanced |  |  | 브라우저 기본 동작 남음 |
| play:paused | 포커스 → (none) |  |  | 브라우저 기본 동작 남음 |
| result | 포커스 → download-replay |  |  | 브라우저 기본 동작 남음 |
| select+options:generation | 설정 lastKeyMode |  |  |  |
| select+options:gear | 설정 lastKeyMode |  |  |  |
| select+options:rules+search | → select+options:rules |  |  | 브라우저 기본 동작 남음 |
| select+options:rules+add | 포커스 → add-menu |  |  | 브라우저 기본 동작 남음 |
| select+info+search | → select+info |  |  | 브라우저 기본 동작 남음 |
| select+info+add | 포커스 → add-menu |  |  | 브라우저 기본 동작 남음 |
| select+add+search | → select+add |  |  | 브라우저 기본 동작 남음 |
| settings:judge | 포커스 → settings-tab-advanced |  |  | 브라우저 기본 동작 남음 |
| settings:gear | 포커스 → settings-tab-advanced |  |  | 브라우저 기본 동작 남음 |
| settings:advanced | 포커스 → settings-tab-pad |  |  | 브라우저 기본 동작 남음 |
| settings:pad | 포커스 → settings-tab-keys |  |  | 브라우저 기본 동작 남음 |
| settings:keys | 포커스 → settings-tab-sound |  |  | 브라우저 기본 동작 남음 |
| settings:sound | 포커스 → settings-tab-fx |  |  | 브라우저 기본 동작 남음 |
| settings:fx | 포커스 → settings-tab-notes |  |  | 브라우저 기본 동작 남음 |
| settings:notes | 포커스 → settings-tab-gear |  |  | 브라우저 기본 동작 남음 |
| settings:play | 포커스 → settings-screen>button[0]:완료 Esc |  |  | 브라우저 기본 동작 남음 |
| result:details | 포커스 → result-export-osu |  |  | 브라우저 기본 동작 남음 |
| select+options:generation+search | → select+options:generation |  |  | 브라우저 기본 동작 남음 |
| select+options:generation+add | 포커스 → add-menu |  |  | 브라우저 기본 동작 남음 |
| select+options:gear+search | → select+options:gear |  |  | 브라우저 기본 동작 남음 |
| select+options:gear+add | 포커스 → add-menu |  |  | 브라우저 기본 동작 남음 |
| calibration:input | 포커스 → calib-step-visual |  |  | 브라우저 기본 동작 남음 |
| calibration:visual | 포커스 → calib-step-visual |  |  | 브라우저 기본 동작 남음 |
| select+first | 설정 lastKeyMode |  |  |  |
| select+first+search | → select+first |  |  | 브라우저 기본 동작 남음 |
| select+first+add | 포커스 → add-menu |  |  | 브라우저 기본 동작 남음 |
| select+first+add+search | → select+first+add |  |  | 브라우저 기본 동작 남음 |
| select+offline | 설정 lastKeyMode |  |  |  |
| select+offline+info | 설정 lastKeyMode |  |  |  |
| select+offline+search | → select+offline |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:rules | 설정 lastKeyMode |  |  |  |
| select+offline+info+search | → select+offline+info |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation | 설정 lastKeyMode |  |  |  |
| select+offline+options:gear | 설정 lastKeyMode |  |  |  |
| select+offline+options:rules+search | → select+offline+options:rules |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation+search | → select+offline+options:generation |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:gear+search | → select+offline+options:gear |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube | 포커스 → bga-youtube |  |  | 브라우저 기본 동작 남음 |
| select+info+analysis+search | → select+info+analysis |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+add | 포커스 → bga-youtube |  |  | 브라우저 기본 동작 남음 |
| select+info+analysis+add | 포커스 → add-menu |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+search | → select+info+youtube |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis | 설정 lastKeyMode |  |  |  |
| select+info+analysis | 설정 lastKeyMode |  |  |  |
| select+info+youtube+analysis+search | → select+info+youtube+analysis |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis+add | 포커스 → add-menu |  |  | 브라우저 기본 동작 남음 |

#### ↑

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 화면 바뀜 | 곡 |  |  |
| select+options:rules | 포커스 → toggle-rules | 항목 |  |  |
| select+search | 화면 바뀜 | 곡 |  |  |
| select+add | 포커스 → open-replay | 곡 |  |  |
| settings:speed |  | 항목 |  |  |
| play:paused | 포커스 → pause-menu>button[2]:나가기 Q |  |  |  |
| select+options:generation | 포커스 → toggle-generation | 항목 |  |  |
| select+options:gear | 포커스 → toggle-gear | 항목 |  |  |
| select+options:rules+search | 화면 바뀜 | 항목 |  |  |
| select+options:rules+add | 포커스 → open-replay | 항목 |  |  |
| select+info+search | 화면 바뀜 | 항목 |  |  |
| select+info+add | 포커스 → open-replay | 항목 |  |  |
| select+add+search | 화면 바뀜 | 곡 |  |  |
| settings:judge |  | 항목 |  |  |
| settings:gear |  | 항목 |  |  |
| settings:advanced |  | 항목 |  | 브라우저 기본 동작 남음 |
| settings:pad |  | 모드 |  | 브라우저 기본 동작 남음 |
| settings:keys |  | 모드 |  | 브라우저 기본 동작 남음 |
| settings:sound |  | 항목 |  | 브라우저 기본 동작 남음 |
| settings:fx |  | 항목 |  | 브라우저 기본 동작 남음 |
| settings:notes |  | 항목 |  | 브라우저 기본 동작 남음 |
| settings:play |  | 항목 |  | 브라우저 기본 동작 남음 |
| select+options:generation+search | 화면 바뀜 | 항목 |  |  |
| select+options:generation+add | 포커스 → open-replay | 항목 |  |  |
| select+options:gear+search | 화면 바뀜 | 항목 |  |  |
| select+options:gear+add | 포커스 → open-replay | 항목 |  |  |
| select+first | 포커스 → first-calibrate | 버튼 |  |  |
| select+first+search |  | 버튼 |  |  |
| select+first+add | 포커스 → open-replay | 버튼 |  |  |
| select+first+add+search |  | 버튼 |  |  |
| select+offline | 포커스 → offline-sync-test |  |  |  |
| select+offline+info | 포커스 → sync-auto | 항목 |  |  |
| select+offline+options:rules | 포커스 → toggle-rules | 항목 |  |  |
| select+offline+info+search |  | 항목 |  |  |
| select+offline+options:generation | 포커스 → toggle-generation | 항목 |  |  |
| select+offline+options:gear | 포커스 → toggle-gear | 항목 |  |  |
| select+offline+options:rules+search |  | 항목 |  |  |
| select+offline+options:generation+search |  | 항목 |  |  |
| select+offline+options:gear+search |  | 항목 |  |  |
| select+info+youtube |  | 항목 |  | 브라우저 기본 동작 남음 |
| select+info+analysis+search | → select+info+search | 항목 |  |  |
| select+info+youtube+add | 포커스 → import-folder-button | 항목 |  |  |
| select+info+analysis+add | 포커스 → open-replay | 항목 |  |  |
| select+info+youtube+search | → select+info+search | 항목 |  |  |
| select+info+youtube+analysis | 포커스 → edit-sections | 항목 |  |  |
| select+info+analysis | → select+info | 항목 |  |  |
| select+info+youtube+analysis+search | → select+info+search | 항목 |  |  |
| select+info+youtube+analysis+add | 포커스 → open-replay | 항목 |  |  |

#### ↓

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 화면 바뀜 | 곡 |  |  |
| select+options:rules | 포커스 → rule-gauge | 항목 |  |  |
| select+search | 화면 바뀜 | 곡 |  |  |
| select+add | 포커스 → demo-button | 곡 |  |  |
| settings:speed | 포커스 → opt-sudden | 항목 |  |  |
| play:paused | 포커스 → pause-menu>button[1]:다시 하기 R |  |  |  |
| select+options:generation | 포커스 → generation-options>button[0]:자동 | 항목 |  |  |
| select+options:gear | 포커스 → quick-sudden | 항목 |  |  |
| select+options:rules+search | 화면 바뀜 | 항목 |  |  |
| select+options:rules+add | 포커스 → demo-button | 항목 |  |  |
| select+info+search | 화면 바뀜 | 항목 |  |  |
| select+info+add | 포커스 → demo-button | 항목 |  |  |
| select+add+search | 화면 바뀜 | 곡 |  |  |
| settings:judge | 포커스 → opt-input-offset | 항목 |  |  |
| settings:gear | 포커스 → opt-hud-type | 항목 |  |  |
| settings:advanced | 포커스 → opt-display-mode | 항목 |  |  |
| settings:pad | 포커스 → opt-tt-steps | 모드 |  |  |
| settings:keys | 포커스 → key-4K-0 | 모드 |  |  |
| settings:sound | 포커스 → opt-music-volume | 항목 |  |  |
| settings:fx | 포커스 → camera-fx | 항목 |  |  |
| settings:notes | 포커스 → opt-note-style | 항목 |  |  |
| settings:play | 포커스 → opt-system | 항목 |  |  |
| select+options:generation+search | 화면 바뀜 | 항목 |  |  |
| select+options:generation+add | 포커스 → demo-button | 항목 |  |  |
| select+options:gear+search | 화면 바뀜 | 항목 |  |  |
| select+options:gear+add | 포커스 → demo-button | 항목 |  |  |
| select+first | 포커스 → first-demo | 버튼 |  |  |
| select+first+search |  | 버튼 |  |  |
| select+first+add | 포커스 → demo-button | 버튼 |  |  |
| select+first+add+search |  | 버튼 |  |  |
| select+offline | 포커스 → offline-sync-test |  |  |  |
| select+offline+info | 포커스 → sync-auto | 항목 |  |  |
| select+offline+options:rules | 포커스 → rule-gauge | 항목 |  |  |
| select+offline+info+search |  | 항목 |  |  |
| select+offline+options:generation | 포커스 → generation-options>button[0]:자동 | 항목 |  |  |
| select+offline+options:gear | 포커스 → quick-sudden | 항목 |  |  |
| select+offline+options:rules+search |  | 항목 |  |  |
| select+offline+options:generation+search |  | 항목 |  |  |
| select+offline+options:gear+search |  | 항목 |  |  |
| select+info+youtube |  | 항목 |  | 브라우저 기본 동작 남음 |
| select+info+analysis+search | → select+info+search | 항목 |  |  |
| select+info+youtube+add | 포커스 → upload-button | 항목 |  |  |
| select+info+analysis+add | 포커스 → demo-button | 항목 |  |  |
| select+info+youtube+search | → select+info+search | 항목 |  |  |
| select+info+youtube+analysis | 포커스 → sync-auto | 항목 |  |  |
| select+info+analysis | → select+info | 항목 |  |  |
| select+info+youtube+analysis+search | → select+info+search | 항목 |  |  |
| select+info+youtube+analysis+add | 포커스 → demo-button | 항목 |  |  |

#### ←

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 설정 lastDifficulty | 난이도 |  |  |
| select+options:rules | 설정 placement | 값 |  |  |
| select+search |  | 난이도 |  | 브라우저 기본 동작 남음 |
| select+add |  | 난이도 |  | 브라우저 기본 동작 남음 |
| settings:speed | 설정 hiSpeed | 값 |  |  |
| select+options:generation | 설정 generation · 포커스 → style-melody | 값 |  |  |
| select+options:gear | 설정 hiSpeed | 값 |  |  |
| select+options:rules+search |  | 값 |  | 브라우저 기본 동작 남음 |
| select+options:rules+add |  | 값 |  | 브라우저 기본 동작 남음 |
| select+info+search |  | 값 |  | 브라우저 기본 동작 남음 |
| select+info+add |  | 값 |  | 브라우저 기본 동작 남음 |
| select+add+search |  | 난이도 |  | 브라우저 기본 동작 남음 |
| settings:judge | 설정 judgementMode | 값 |  |  |
| settings:gear | 설정 parts | 값 |  |  |
| settings:advanced |  | 값 |  | 브라우저 기본 동작 남음 |
| settings:pad |  | 레인 |  | 브라우저 기본 동작 남음 |
| settings:keys |  | 레인 |  | 브라우저 기본 동작 남음 |
| settings:sound |  | 값 |  | 브라우저 기본 동작 남음 |
| settings:fx |  | 값 |  | 브라우저 기본 동작 남음 |
| settings:notes |  | 값 |  | 브라우저 기본 동작 남음 |
| settings:play |  | 값 |  | 브라우저 기본 동작 남음 |
| select+options:generation+search |  | 값 |  | 브라우저 기본 동작 남음 |
| select+options:generation+add |  | 값 |  | 브라우저 기본 동작 남음 |
| select+options:gear+search |  | 값 |  | 브라우저 기본 동작 남음 |
| select+options:gear+add |  | 값 |  | 브라우저 기본 동작 남음 |
| calibration:visual | 화면 바뀜 | 1ms | ← → 1ms · Shift 5ms |  |
| select+first | 포커스 → first-calibrate |  |  |  |
| select+offline | 포커스 → offline-sync-test | 버튼 |  |  |
| select+offline+info | 포커스 → sync-auto | 값 |  |  |
| select+offline+search |  | 버튼 |  | 브라우저 기본 동작 남음 |
| select+offline+options:rules | 설정 placement | 값 |  |  |
| select+offline+info+search |  | 값 |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation | 설정 generation · 포커스 → style-melody | 값 |  |  |
| select+offline+options:gear | 설정 hiSpeed | 값 |  |  |
| select+offline+options:rules+search |  | 값 |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation+search |  | 값 |  | 브라우저 기본 동작 남음 |
| select+offline+options:gear+search |  | 값 |  | 브라우저 기본 동작 남음 |
| select+info+youtube |  | 값 |  | 브라우저 기본 동작 남음 |
| select+info+analysis+search |  | 값 |  | 브라우저 기본 동작 남음 |
| select+info+youtube+add |  | 값 |  | 브라우저 기본 동작 남음 |
| select+info+analysis+add |  | 값 |  | 브라우저 기본 동작 남음 |
| select+info+youtube+search |  | 값 |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis |  | 값 |  |  |
| select+info+analysis | 설정 lastDifficulty | 값 |  |  |
| select+info+youtube+analysis+search |  | 값 |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis+add |  | 값 |  | 브라우저 기본 동작 남음 |

#### →

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 설정 lastDifficulty | 난이도 |  |  |
| select+options:rules | 설정 placement | 값 |  |  |
| select+search |  | 난이도 |  | 브라우저 기본 동작 남음 |
| select+add |  | 난이도 |  | 브라우저 기본 동작 남음 |
| settings:speed | 설정 hiSpeed | 값 |  |  |
| select+options:generation | 설정 generation · 포커스 → style-stream | 값 |  |  |
| select+options:gear | 설정 hiSpeed | 값 |  |  |
| select+options:rules+search |  | 값 |  | 브라우저 기본 동작 남음 |
| select+options:rules+add |  | 값 |  | 브라우저 기본 동작 남음 |
| select+info+search |  | 값 |  | 브라우저 기본 동작 남음 |
| select+info+add |  | 값 |  | 브라우저 기본 동작 남음 |
| select+add+search |  | 난이도 |  | 브라우저 기본 동작 남음 |
| settings:judge | 설정 judgementMode | 값 |  |  |
| settings:gear | 설정 parts | 값 |  |  |
| settings:advanced |  | 값 |  | 브라우저 기본 동작 남음 |
| settings:pad |  | 레인 |  | 브라우저 기본 동작 남음 |
| settings:keys |  | 레인 |  | 브라우저 기본 동작 남음 |
| settings:sound |  | 값 |  | 브라우저 기본 동작 남음 |
| settings:fx |  | 값 |  | 브라우저 기본 동작 남음 |
| settings:notes |  | 값 |  | 브라우저 기본 동작 남음 |
| settings:play |  | 값 |  | 브라우저 기본 동작 남음 |
| select+options:generation+search |  | 값 |  | 브라우저 기본 동작 남음 |
| select+options:generation+add |  | 값 |  | 브라우저 기본 동작 남음 |
| select+options:gear+search |  | 값 |  | 브라우저 기본 동작 남음 |
| select+options:gear+add |  | 값 |  | 브라우저 기본 동작 남음 |
| calibration:visual | 화면 바뀜 | 1ms | ← → 1ms · Shift 5ms |  |
| select+first | 포커스 → first-demo |  |  |  |
| select+offline | 포커스 → offline-sync-test | 버튼 |  |  |
| select+offline+info | 포커스 → sync-auto | 값 |  |  |
| select+offline+search |  | 버튼 |  | 브라우저 기본 동작 남음 |
| select+offline+options:rules | 설정 placement | 값 |  |  |
| select+offline+info+search |  | 값 |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation | 설정 generation · 포커스 → style-stream | 값 |  |  |
| select+offline+options:gear | 설정 hiSpeed | 값 |  |  |
| select+offline+options:rules+search |  | 값 |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation+search |  | 값 |  | 브라우저 기본 동작 남음 |
| select+offline+options:gear+search |  | 값 |  | 브라우저 기본 동작 남음 |
| select+info+youtube |  | 값 |  | 브라우저 기본 동작 남음 |
| select+info+analysis+search |  | 값 |  | 브라우저 기본 동작 남음 |
| select+info+youtube+add |  | 값 |  | 브라우저 기본 동작 남음 |
| select+info+analysis+add |  | 값 |  | 브라우저 기본 동작 남음 |
| select+info+youtube+search |  | 값 |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis | 포커스 → remove-song | 값 |  |  |
| select+info+analysis | 설정 lastDifficulty | 값 |  |  |
| select+info+youtube+analysis+search |  | 값 |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis+add |  | 값 |  | 브라우저 기본 동작 남음 |

#### PgUp

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select |  | 페이지 |  |  |
| select+options:rules | → select+options:generation |  |  |  |
| select+search |  | 페이지 |  |  |
| select+add |  | 페이지 |  | 브라우저 기본 동작 남음 |
| settings:speed | → settings:judge |  |  |  |
| select+options:generation | → select+options:gear |  |  |  |
| select+options:gear | → select+options:rules |  |  |  |
| select+add+search |  | 페이지 |  |  |
| settings:judge | → settings:play |  |  |  |
| settings:gear | → settings:speed |  |  |  |
| settings:advanced | → settings:pad |  |  |  |
| settings:pad | → settings:keys |  |  |  |
| settings:keys | → settings:sound |  |  |  |
| settings:sound | → settings:fx |  |  |  |
| settings:fx | → settings:notes |  |  |  |
| settings:notes | → settings:gear |  |  |  |
| settings:play | → settings:advanced |  |  |  |
| calibration:input | → calibration:visual |  |  |  |
| calibration:visual | → calibration:input |  |  |  |
| select+offline+options:rules | → select+offline+options:generation |  |  |  |
| select+offline+options:generation | → select+offline+options:gear |  |  |  |
| select+offline+options:gear | → select+offline+options:rules |  |  |  |

#### PgDn

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 화면 바뀜 | 페이지 |  |  |
| select+options:rules | → select+options:gear |  |  |  |
| select+search | 화면 바뀜 | 페이지 |  |  |
| select+add |  | 페이지 |  | 브라우저 기본 동작 남음 |
| settings:speed | → settings:gear |  |  |  |
| select+options:generation | → select+options:rules |  |  |  |
| select+options:gear | → select+options:generation |  |  |  |
| select+options:rules+search | 화면 바뀜 |  |  |  |
| select+info+search | 화면 바뀜 |  |  |  |
| select+add+search | 화면 바뀜 | 페이지 |  |  |
| settings:judge | → settings:speed |  |  |  |
| settings:gear | → settings:notes |  |  |  |
| settings:advanced | → settings:play |  |  |  |
| settings:pad | → settings:advanced |  |  |  |
| settings:keys | → settings:pad |  |  |  |
| settings:sound | → settings:keys |  |  |  |
| settings:fx | → settings:sound |  |  |  |
| settings:notes | → settings:fx |  |  |  |
| settings:play | → settings:judge |  |  |  |
| select+options:generation+search | 화면 바뀜 |  |  |  |
| select+options:gear+search | 화면 바뀜 |  |  |  |
| calibration:input | → calibration:visual |  |  |  |
| calibration:visual | → calibration:input |  |  |  |
| select+offline+options:rules | → select+offline+options:gear |  |  |  |
| select+offline+options:generation | → select+offline+options:rules |  |  |  |
| select+offline+options:gear | → select+offline+options:generation |  |  |  |
| select+info+analysis+search | → select+info+search |  |  |  |
| select+info+youtube+search | → select+info+search |  |  |  |
| select+info+analysis | → select+info |  |  |  |
| select+info+youtube+analysis+search | → select+info+search |  |  |  |

#### Home

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+offline+info | 포커스 → sync-auto |  |  |  |
| select+info+youtube+analysis | 포커스 → song-info>button[2]:×2 |  |  |  |

#### End

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 화면 바뀜 |  |  |  |
| select+options:rules | 포커스 → practice-toggle |  |  |  |
| select+options:generation | 포커스 → generation-options>button[9]:생성 옵션 초기화 |  |  |  |
| select+options:gear | 포커스 → quick-key-beam |  |  |  |
| select+offline+info | 포커스 → sync-auto |  |  |  |
| select+offline+options:rules | 포커스 → practice-toggle |  |  |  |
| select+offline+options:generation | 포커스 → generation-options>button[9]:생성 옵션 초기화 |  |  |  |
| select+offline+options:gear | 포커스 → quick-key-beam |  |  |  |
| select+info+youtube+analysis | 포커스 → sync-auto |  |  |  |
| select+info+analysis | → select+info |  |  |  |

#### Q

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+options:rules | → select+options:generation | 탭 |  |  |
| select+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| settings:speed | → settings:judge | 탭 | QE 탭 이동 |  |
| play:paused | → select |  | 나가기 Q | 브라우저 기본 동작 남음 |
| select+options:generation | → select+options:gear | 탭 |  |  |
| select+options:gear | → select+options:rules | 탭 |  |  |
| select+options:rules+search | 화면 바뀜 | 탭 |  | 브라우저 기본 동작 남음 |
| select+options:rules+add |  | 탭 |  | 브라우저 기본 동작 남음 |
| select+info+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+add+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| settings:judge | → settings:play | 탭 | QE 탭 이동 |  |
| settings:gear | → settings:speed | 탭 | QE 탭 이동 |  |
| settings:advanced | → settings:pad | 탭 | QE 탭 이동 |  |
| settings:pad | → settings:keys | 탭 | QE 탭 이동 |  |
| settings:keys | → settings:sound | 탭 | QE 탭 이동 |  |
| settings:sound | → settings:fx | 탭 | QE 탭 이동 |  |
| settings:fx | → settings:notes | 탭 | QE 탭 이동 |  |
| settings:notes | → settings:gear | 탭 | QE 탭 이동 |  |
| settings:play | → settings:advanced | 탭 | QE 탭 이동 |  |
| select+options:generation+search | 화면 바뀜 | 탭 |  | 브라우저 기본 동작 남음 |
| select+options:generation+add |  | 탭 |  | 브라우저 기본 동작 남음 |
| select+options:gear+search | 화면 바뀜 | 탭 |  | 브라우저 기본 동작 남음 |
| select+options:gear+add |  | 탭 |  | 브라우저 기본 동작 남음 |
| calibration:input | → calibration:visual | 단계 |  |  |
| calibration:visual | → calibration:input | 단계 |  |  |
| select+first+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+first+add+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:rules | → select+offline+options:generation | 탭 |  |  |
| select+offline+info+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation | → select+offline+options:gear | 탭 |  |  |
| select+offline+options:gear | → select+offline+options:rules | 탭 |  |  |
| select+offline+options:rules+search | 화면 바뀜 | 탭 |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation+search | 화면 바뀜 | 탭 |  | 브라우저 기본 동작 남음 |
| select+offline+options:gear+search | 화면 바뀜 | 탭 |  | 브라우저 기본 동작 남음 |
| select+info+youtube | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+analysis+search | → select+info+search |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+add | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+search | → select+info+search |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis+search | → select+info+search |  |  | 브라우저 기본 동작 남음 |

#### E

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+options:rules | → select+options:gear | 탭 |  |  |
| select+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| settings:speed | → settings:gear | 탭 | QE 탭 이동 |  |
| select+options:generation | → select+options:rules | 탭 |  |  |
| select+options:gear | → select+options:generation | 탭 |  |  |
| select+options:rules+search | 화면 바뀜 | 탭 |  | 브라우저 기본 동작 남음 |
| select+options:rules+add |  | 탭 |  | 브라우저 기본 동작 남음 |
| select+info+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+add+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| settings:judge | → settings:speed | 탭 | QE 탭 이동 |  |
| settings:gear | → settings:notes | 탭 | QE 탭 이동 |  |
| settings:advanced | → settings:play | 탭 | QE 탭 이동 |  |
| settings:pad | → settings:advanced | 탭 | QE 탭 이동 |  |
| settings:keys | → settings:pad | 탭 | QE 탭 이동 |  |
| settings:sound | → settings:keys | 탭 | QE 탭 이동 |  |
| settings:fx | → settings:sound | 탭 | QE 탭 이동 |  |
| settings:notes | → settings:fx | 탭 | QE 탭 이동 |  |
| settings:play | → settings:judge | 탭 | QE 탭 이동 |  |
| select+options:generation+search | 화면 바뀜 | 탭 |  | 브라우저 기본 동작 남음 |
| select+options:generation+add |  | 탭 |  | 브라우저 기본 동작 남음 |
| select+options:gear+search | 화면 바뀜 | 탭 |  | 브라우저 기본 동작 남음 |
| select+options:gear+add |  | 탭 |  | 브라우저 기본 동작 남음 |
| calibration:input | → calibration:visual | 단계 |  |  |
| calibration:visual | → calibration:input | 단계 |  |  |
| select+first+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+first+add+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:rules | → select+offline+options:gear | 탭 |  |  |
| select+offline+info+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation | → select+offline+options:rules | 탭 |  |  |
| select+offline+options:gear | → select+offline+options:generation | 탭 |  |  |
| select+offline+options:rules+search | 화면 바뀜 | 탭 |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation+search | 화면 바뀜 | 탭 |  | 브라우저 기본 동작 남음 |
| select+offline+options:gear+search | 화면 바뀜 | 탭 |  | 브라우저 기본 동작 남음 |
| select+info+youtube | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+analysis+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+add | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |

#### R

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| play:paused | → play:running |  | 다시 하기 R | 브라우저 기본 동작 남음 |
| result | → play:running | 다시 하기 | 다시 하기 R |  |
| select+options:rules+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+add+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| result:details | → play:running | 다시 하기 | 다시 하기 R |  |
| select+options:generation+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+options:gear+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+first+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+first+add+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+info+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:rules+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:gear+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+analysis+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+add | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |

#### Shift+R

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| play:paused | → play:running |  |  | 브라우저 기본 동작 남음 |
| result | → play:running |  |  |  |
| select+options:rules+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+add+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| result:details | → play:running |  |  |  |
| select+options:generation+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+options:gear+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+first+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+first+add+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+info+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:rules+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:gear+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+analysis+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+add | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |

#### I

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → select+info | 곡 정보·도구 | 정보·도구 I | 브라우저 기본 동작 남음 |
| select+options:rules | → select+info | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+search | 화면 바뀜 | 곡 정보·도구 | 정보·도구 I | 브라우저 기본 동작 남음 |
| select+add |  | 곡 정보·도구 | 정보·도구 I | 브라우저 기본 동작 남음 |
| select+options:generation | → select+info | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+options:gear | → select+info | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+options:rules+search | 화면 바뀜 | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+options:rules+add |  | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+info+search | 화면 바뀜 | 곡 정보·도구 닫기 |  | 브라우저 기본 동작 남음 |
| select+info+add |  | 곡 정보·도구 닫기 |  | 브라우저 기본 동작 남음 |
| select+add+search | 화면 바뀜 | 곡 정보·도구 | 정보·도구 I | 브라우저 기본 동작 남음 |
| select+options:generation+search | 화면 바뀜 | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+options:generation+add |  | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+options:gear+search | 화면 바뀜 | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+options:gear+add |  | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+first | → select+info | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+first+search | 화면 바뀜 | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+first+add |  | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+first+add+search | 화면 바뀜 | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+offline | → select+offline+info |  |  | 브라우저 기본 동작 남음 |
| select+offline+info | → select+offline | 곡 정보·도구 닫기 |  | 브라우저 기본 동작 남음 |
| select+offline+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:rules | → select+offline+info | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+offline+info+search | 화면 바뀜 | 곡 정보·도구 닫기 |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation | → select+offline+info | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+offline+options:gear | → select+offline+info | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+offline+options:rules+search | 화면 바뀜 | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation+search | 화면 바뀜 | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+offline+options:gear+search | 화면 바뀜 | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+info+youtube | 화면 바뀜 | 곡 정보·도구 닫기 |  | 브라우저 기본 동작 남음 |
| select+info+analysis+search | 화면 바뀜 | 곡 정보·도구 닫기 |  | 브라우저 기본 동작 남음 |
| select+info+youtube+add | 화면 바뀜 | 곡 정보·도구 닫기 |  | 브라우저 기본 동작 남음 |
| select+info+analysis+add |  | 곡 정보·도구 닫기 |  | 브라우저 기본 동작 남음 |
| select+info+youtube+search | 화면 바뀜 | 곡 정보·도구 닫기 |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis | → select | 곡 정보·도구 닫기 |  | 브라우저 기본 동작 남음 |
| select+info+analysis | → select | 곡 정보·도구 닫기 |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis+search | 화면 바뀜 | 곡 정보·도구 닫기 |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis+add |  | 곡 정보·도구 닫기 |  | 브라우저 기본 동작 남음 |

#### F

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+options:rules+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+add+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+options:generation+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+options:gear+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+first |  |  | 4K 키는 DFJK입니다. 음악 파일(mp3 · ogg · wav · flac · m4a) | 브라우저 기본 동작 남음 |
| select+first+search | 화면 바뀜 |  | 4K 키는 DFJK입니다. 음악 파일(mp3 · ogg · wav · flac · m4a) | 브라우저 기본 동작 남음 |
| select+first+add |  |  | 4K 키는 DFJK입니다. 음악 파일(mp3 · ogg · wav · flac · m4a) | 브라우저 기본 동작 남음 |
| select+first+add+search | 화면 바뀜 |  | 4K 키는 DFJK입니다. 음악 파일(mp3 · ogg · wav · flac · m4a) | 브라우저 기본 동작 남음 |
| select+offline+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+info+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:rules+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:gear+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+analysis+search | → select+info+search |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+add | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+search | → select+info+search |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis+search | → select+info+search |  |  | 브라우저 기본 동작 남음 |

#### M

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+options:rules+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+add+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+options:generation+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+options:gear+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+first+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+first+add+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+info+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:rules+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:gear+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+analysis+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+add | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |

#### T

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+options:rules+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+add+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+options:generation+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+options:gear+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+first+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+first+add+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+info+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:rules+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:gear+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+analysis+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+add | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |

#### P

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+options:rules+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+add+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+options:generation+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+options:gear+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+first+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+first+add+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+info+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:rules+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:gear+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+analysis+search | → select+info+search |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+add | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+search | → select+info+search |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis+search | → select+info+search |  |  | 브라우저 기본 동작 남음 |

#### Slash

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → select+search |  |  |  |
| select+options:rules | → select+options:rules+search |  |  |  |
| select+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+add | → select+search |  |  |  |
| select+options:generation | → select+options:generation+search |  |  |  |
| select+options:gear | → select+options:gear+search |  |  |  |
| select+options:rules+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+options:rules+add | → select+options:rules+search |  |  |  |
| select+info+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+add | → select+info+search |  |  |  |
| select+add+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+options:generation+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+options:generation+add | → select+options:generation+search |  |  |  |
| select+options:gear+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+options:gear+add | → select+options:gear+search |  |  |  |
| select+first | → select+first+search |  |  |  |
| select+first+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+first+add | → select+first+search |  |  |  |
| select+first+add+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline | → select+offline+search |  |  |  |
| select+offline+info | → select+offline+info+search |  |  |  |
| select+offline+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:rules | → select+offline+options:rules+search |  |  |  |
| select+offline+info+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation | → select+offline+options:generation+search |  |  |  |
| select+offline+options:gear | → select+offline+options:gear+search |  |  |  |
| select+offline+options:rules+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:gear+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+analysis+search | → select+info+search |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+add | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+analysis+add | → select+info+analysis+search |  |  |  |
| select+info+youtube+search | → select+info+search |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis | → select+info+youtube+analysis+search |  |  |  |
| select+info+analysis | → select+info+analysis+search |  |  |  |
| select+info+youtube+analysis+search | → select+info+search |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis+add | → select+info+youtube+analysis+search |  |  |  |

#### +

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → select+add |  | 곡 추가 + |  |
| select+options:rules | → select+options:rules+add |  | 곡 추가 + |  |
| select+search | 화면 바뀜 |  | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+add |  |  | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+options:generation | → select+options:generation+add |  | 곡 추가 + |  |
| select+options:gear | → select+options:gear+add |  | 곡 추가 + |  |
| select+options:rules+search | 화면 바뀜 |  | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+options:rules+add |  |  | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+info+search | 화면 바뀜 |  | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+info+add |  |  | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+add+search | 화면 바뀜 |  | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+options:generation+search | 화면 바뀜 |  | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+options:generation+add |  |  | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+options:gear+search | 화면 바뀜 |  | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+options:gear+add |  |  | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+first | → select+first+add | 곡 추가 | 곡 추가 + |  |
| select+first+search | 화면 바뀜 | 곡 추가 | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+first+add |  | 곡 추가 | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+first+add+search | 화면 바뀜 | 곡 추가 | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+offline |  |  | 곡 추가 + |  |
| select+offline+info |  |  | 곡 추가 + |  |
| select+offline+search | 화면 바뀜 |  | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+offline+options:rules |  |  | 곡 추가 + |  |
| select+offline+info+search | 화면 바뀜 |  | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+offline+options:generation |  |  | 곡 추가 + |  |
| select+offline+options:gear |  |  | 곡 추가 + |  |
| select+offline+options:rules+search | 화면 바뀜 |  | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+offline+options:generation+search | 화면 바뀜 |  | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+offline+options:gear+search | 화면 바뀜 |  | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+info+youtube | 화면 바뀜 |  | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+info+analysis+search | → select+info+search |  | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+info+youtube+add | 화면 바뀜 |  | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+info+analysis+add |  |  | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+info+youtube+search | → select+info+search |  | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis | → select+info+youtube+analysis+add |  | 곡 추가 + |  |
| select+info+analysis | → select+info+analysis+add |  | 곡 추가 + |  |
| select+info+youtube+analysis+search | → select+info+search |  | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis+add |  |  | 곡 추가 + | 브라우저 기본 동작 남음 |

#### Minus

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+options:rules+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+add+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+options:generation+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+options:gear+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+first+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+first+add+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+info+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:rules+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:gear+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+analysis+search | → select+info+search |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+add | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+search | → select+info+search |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis+search | → select+info+search |  |  | 브라우저 기본 동작 남음 |

#### Backspace

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| settings:keys+capture | → settings:keys |  |  |  |

#### Shift(단독)

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 설정 songFolder | 폴더 |  | 브라우저 기본 동작 남음 |
| select+options:rules | 설정 songFolder |  |  | 브라우저 기본 동작 남음 |
| select+search |  | 폴더 |  | 브라우저 기본 동작 남음 |
| select+add |  | 폴더 |  | 브라우저 기본 동작 남음 |
| select+options:generation | 설정 songFolder |  |  | 브라우저 기본 동작 남음 |
| select+options:gear | 설정 songFolder |  |  | 브라우저 기본 동작 남음 |
| select+add+search |  | 폴더 |  | 브라우저 기본 동작 남음 |
| calibration:visual |  |  | ← → 1ms · Shift 5ms | 브라우저 기본 동작 남음 |
| select+first | 설정 songFolder |  |  | 브라우저 기본 동작 남음 |
| select+offline | 설정 songFolder |  |  | 브라우저 기본 동작 남음 |
| select+offline+info | 설정 songFolder |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:rules | 설정 songFolder |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:generation | 설정 songFolder |  |  | 브라우저 기본 동작 남음 |
| select+offline+options:gear | 설정 songFolder |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis | → select+info |  |  | 브라우저 기본 동작 남음 |
| select+info+analysis | → select+info |  |  | 브라우저 기본 동작 남음 |

#### Shift+Enter

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → play:running | 오토 플레이 | 오토 플레이 Shift+Enter |  |
| select+options:rules | → play:running | 오토 플레이 |  |  |
| select+search | → select | 오토 플레이 | 오토 플레이 Shift+Enter |  |
| select+add |  |  | 오토 플레이 Shift+Enter |  |
| play:paused | → play:running |  |  | 브라우저 기본 동작 남음 |
| result | → select |  |  | 브라우저 기본 동작 남음 |
| select+options:generation | → play:running | 오토 플레이 |  |  |
| select+options:gear | → play:running | 오토 플레이 |  |  |
| select+options:rules+search | → select+options:rules | 오토 플레이 |  |  |
| select+info+search | → select+info | 오토 플레이 |  |  |
| select+add+search | → select+add |  | 오토 플레이 Shift+Enter |  |
| settings:judge | 설정 judgementMode |  |  |  |
| settings:gear | 설정 parts |  |  |  |
| result:details | → select |  |  | 브라우저 기본 동작 남음 |
| select+options:generation+search | → select+options:generation | 오토 플레이 |  |  |
| select+options:gear+search | → select+options:gear | 오토 플레이 |  |  |
| calibration:input | → calibration:input+running |  |  | 브라우저 기본 동작 남음 |
| calibration:visual | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+first+search | → select+first |  |  |  |
| select+first+add+search | → select+first+add |  |  |  |
| select+offline+search | → select+offline |  |  |  |
| select+offline+info+search | → select+offline+info |  |  |  |
| select+offline+options:rules+search | → select+offline+options:rules |  |  |  |
| select+offline+options:generation+search | → select+offline+options:generation |  |  |  |
| select+offline+options:gear+search | → select+offline+options:gear |  |  |  |
| select+info+youtube |  | 오토 플레이 |  | 브라우저 기본 동작 남음 |
| select+info+analysis+search | → select+info+analysis | 오토 플레이 |  |  |
| select+info+youtube+search | → select+info+youtube | 오토 플레이 |  |  |
| select+info+youtube+analysis | 화면 바뀜 |  |  |  |
| select+info+analysis | 화면 바뀜 | 오토 플레이 |  |  |
| select+info+youtube+analysis+search | → select+info+youtube+analysis | 오토 플레이 |  |  |

#### Ctrl+F

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → select+search |  |  |  |
| select+options:rules | → select+options:rules+search |  |  |  |
| select+add | → select+search |  |  |  |
| select+options:generation | → select+options:generation+search |  |  |  |
| select+options:gear | → select+options:gear+search |  |  |  |
| select+options:rules+add | → select+options:rules+search |  |  |  |
| select+info+add | → select+info+search |  |  |  |
| select+add+search | → select+search |  |  |  |
| select+options:generation+add | → select+options:generation+search |  |  |  |
| select+options:gear+add | → select+options:gear+search |  |  |  |
| select+first | → select+first+search |  |  |  |
| select+first+add | → select+first+search |  |  |  |
| select+first+add+search | → select+first+search |  |  |  |
| select+offline | → select+offline+search |  |  |  |
| select+offline+info | → select+offline+info+search |  |  |  |
| select+offline+options:rules | → select+offline+options:rules+search |  |  |  |
| select+offline+options:generation | → select+offline+options:generation+search |  |  |  |
| select+offline+options:gear | → select+offline+options:gear+search |  |  |  |
| select+info+youtube | → select+info+youtube+search |  |  |  |
| select+info+youtube+add | → select+info+youtube+search |  |  |  |
| select+info+analysis+add | → select+info+analysis+search |  |  |  |
| select+info+youtube+analysis | → select+info+youtube+analysis+search |  |  |  |
| select+info+analysis | → select+info+analysis+search |  |  |  |
| select+info+youtube+analysis+add | → select+info+youtube+analysis+search |  |  |  |

#### F2

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 화면 바뀜 | 랜덤 |  |  |
| select+search | 화면 바뀜 | 랜덤 |  |  |
| select+add | 화면 바뀜 | 랜덤 |  |  |
| play:paused | → play:running |  |  |  |
| result | → play:running |  |  |  |
| select+add+search | 화면 바뀜 | 랜덤 |  |  |
| result:details | → play:running |  |  |  |
| select+info+analysis | → select+info |  |  |  |

#### F3

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 설정 favorites | 즐겨찾기 | 즐겨찾기 F3 |  |
| select+options:rules | 설정 favorites |  |  |  |
| select+search | 설정 favorites | 즐겨찾기 | 즐겨찾기 F3 |  |
| select+add | 설정 favorites | 즐겨찾기 | 즐겨찾기 F3 |  |
| select+options:generation | 설정 favorites |  |  |  |
| select+options:gear | 설정 favorites |  |  |  |
| select+options:rules+search | 설정 favorites |  |  |  |
| select+options:rules+add | 설정 favorites |  |  |  |
| select+info+search | 설정 favorites |  |  |  |
| select+info+add | 설정 favorites |  |  |  |
| select+add+search | 설정 favorites | 즐겨찾기 | 즐겨찾기 F3 |  |
| select+options:generation+search | 설정 favorites |  |  |  |
| select+options:generation+add | 설정 favorites |  |  |  |
| select+options:gear+search | 설정 favorites |  |  |  |
| select+options:gear+add | 설정 favorites |  |  |  |
| select+info+youtube | 설정 favorites |  |  |  |
| select+info+analysis+search | 설정 favorites |  |  |  |
| select+info+youtube+add | 설정 favorites |  |  |  |
| select+info+analysis+add | 설정 favorites |  |  |  |
| select+info+youtube+search | 설정 favorites |  |  |  |
| select+info+youtube+analysis | 설정 favorites |  |  |  |
| select+info+analysis | 설정 favorites |  |  |  |
| select+info+youtube+analysis+search | 설정 favorites |  |  |  |
| select+info+youtube+analysis+add | 설정 favorites |  |  |  |

#### F4

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 설정 songSort |  | 추가순 F4 |  |
| select+options:rules | 설정 songSort |  | 추가순 F4 |  |
| select+search | 설정 songSort |  | 추가순 F4 |  |
| select+add | 설정 songSort |  | 추가순 F4 |  |
| select+options:generation | 설정 songSort |  | 추가순 F4 |  |
| select+options:gear | 설정 songSort |  | 추가순 F4 |  |
| select+options:rules+search | 설정 songSort |  | 추가순 F4 |  |
| select+options:rules+add | 설정 songSort |  | 추가순 F4 |  |
| select+info+search | 설정 songSort |  | 추가순 F4 |  |
| select+info+add | 설정 songSort |  | 추가순 F4 |  |
| select+add+search | 설정 songSort |  | 추가순 F4 |  |
| select+options:generation+search | 설정 songSort |  | 추가순 F4 |  |
| select+options:generation+add | 설정 songSort |  | 추가순 F4 |  |
| select+options:gear+search | 설정 songSort |  | 추가순 F4 |  |
| select+options:gear+add | 설정 songSort |  | 추가순 F4 |  |
| select+first | 설정 songSort |  | 추가순 F4 |  |
| select+first+search | 설정 songSort |  | 추가순 F4 |  |
| select+first+add | 설정 songSort |  | 추가순 F4 |  |
| select+first+add+search | 설정 songSort |  | 추가순 F4 |  |
| select+offline | 설정 songSort |  | 추가순 F4 |  |
| select+offline+info | 설정 songSort |  | 추가순 F4 |  |
| select+offline+search | 설정 songSort |  | 추가순 F4 |  |
| select+offline+options:rules | 설정 songSort |  | 추가순 F4 |  |
| select+offline+info+search | 설정 songSort |  | 추가순 F4 |  |
| select+offline+options:generation | 설정 songSort |  | 추가순 F4 |  |
| select+offline+options:gear | 설정 songSort |  | 추가순 F4 |  |
| select+offline+options:rules+search | 설정 songSort |  | 추가순 F4 |  |
| select+offline+options:generation+search | 설정 songSort |  | 추가순 F4 |  |
| select+offline+options:gear+search | 설정 songSort |  | 추가순 F4 |  |
| select+info+youtube | 설정 songSort |  | 추가순 F4 |  |
| select+info+analysis+search | 설정 songSort |  | 추가순 F4 |  |
| select+info+youtube+add | 설정 songSort |  | 추가순 F4 |  |
| select+info+analysis+add | 설정 songSort |  | 추가순 F4 |  |
| select+info+youtube+search | 설정 songSort |  | 추가순 F4 |  |
| select+info+youtube+analysis | 설정 songSort |  | 추가순 F4 |  |
| select+info+analysis | 설정 songSort |  | 추가순 F4 |  |
| select+info+youtube+analysis+search | 설정 songSort |  | 추가순 F4 |  |
| select+info+youtube+analysis+add | 설정 songSort |  | 추가순 F4 |  |

#### F5

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 설정 patterns |  | 새 패턴 F5 |  |
| select+options:rules | 설정 patterns |  | 새 패턴 F5 |  |
| select+search | 설정 patterns |  | 새 패턴 F5 |  |
| select+add | 설정 patterns |  | 새 패턴 F5 |  |
| result | → play:running | 새 패턴 | 새 패턴 F5 |  |
| select+options:generation | 설정 patterns |  | 새 패턴 F5 |  |
| select+options:gear | 설정 patterns |  | 새 패턴 F5 |  |
| select+options:rules+search | 설정 patterns |  | 새 패턴 F5 |  |
| select+options:rules+add | 설정 patterns |  | 새 패턴 F5 |  |
| select+info+search | 설정 patterns |  | 새 패턴 F5 |  |
| select+info+add | 설정 patterns |  | 새 패턴 F5 |  |
| select+add+search | 설정 patterns |  | 새 패턴 F5 |  |
| result:details | → play:running | 새 패턴 | 새 패턴 F5 |  |
| select+options:generation+search | 설정 patterns |  | 새 패턴 F5 |  |
| select+options:generation+add | 설정 patterns |  | 새 패턴 F5 |  |
| select+options:gear+search | 설정 patterns |  | 새 패턴 F5 |  |
| select+options:gear+add | 설정 patterns |  | 새 패턴 F5 |  |
| select+info+youtube | 화면 바뀜 |  | 새 패턴 F5 |  |
| select+info+analysis+search | 화면 바뀜 |  | 새 패턴 F5 |  |
| select+info+youtube+add | 화면 바뀜 |  | 새 패턴 F5 |  |
| select+info+analysis+add | 화면 바뀜 |  | 새 패턴 F5 |  |
| select+info+youtube+search | 화면 바뀜 |  | 새 패턴 F5 |  |
| select+info+youtube+analysis | 화면 바뀜 |  | 새 패턴 F5 |  |
| select+info+analysis | 화면 바뀜 |  | 새 패턴 F5 |  |
| select+info+youtube+analysis+search | 화면 바뀜 |  | 새 패턴 F5 |  |
| select+info+youtube+analysis+add | 화면 바뀜 |  | 새 패턴 F5 |  |

#### Shift+F5

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| result | → play:running |  |  |  |
| result:details | → play:running |  |  |  |

#### F6

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 설정 songFolder |  |  |  |
| select+options:rules | 설정 songFolder |  |  |  |
| select+search | 설정 songFolder |  |  |  |
| select+add | 설정 songFolder |  |  |  |
| select+options:generation | 설정 songFolder |  |  |  |
| select+options:gear | 설정 songFolder |  |  |  |
| select+options:rules+search | 설정 songFolder |  |  |  |
| select+options:rules+add | 설정 songFolder |  |  |  |
| select+info+search | 설정 songFolder |  |  |  |
| select+info+add | 설정 songFolder |  |  |  |
| select+add+search | 설정 songFolder |  |  |  |
| select+options:generation+search | 설정 songFolder |  |  |  |
| select+options:generation+add | 설정 songFolder |  |  |  |
| select+options:gear+search | 설정 songFolder |  |  |  |
| select+options:gear+add | 설정 songFolder |  |  |  |
| select+first | 설정 songFolder |  |  |  |
| select+first+search | 설정 songFolder |  |  |  |
| select+first+add | 설정 songFolder |  |  |  |
| select+first+add+search | 설정 songFolder |  |  |  |
| select+offline | 설정 songFolder |  |  |  |
| select+offline+info | 설정 songFolder |  |  |  |
| select+offline+search | 설정 songFolder |  |  |  |
| select+offline+options:rules | 설정 songFolder |  |  |  |
| select+offline+info+search | 설정 songFolder |  |  |  |
| select+offline+options:generation | 설정 songFolder |  |  |  |
| select+offline+options:gear | 설정 songFolder |  |  |  |
| select+offline+options:rules+search | 설정 songFolder |  |  |  |
| select+offline+options:generation+search | 설정 songFolder |  |  |  |
| select+offline+options:gear+search | 설정 songFolder |  |  |  |
| select+info+youtube | → select+info |  |  |  |
| select+info+analysis+search | → select+info+search |  |  |  |
| select+info+youtube+add | → select+info+add |  |  |  |
| select+info+analysis+add | → select+info+add |  |  |  |
| select+info+youtube+search | → select+info+search |  |  |  |
| select+info+youtube+analysis | → select+info |  |  |  |
| select+info+analysis | → select+info |  |  |  |
| select+info+youtube+analysis+search | → select+info+search |  |  |  |
| select+info+youtube+analysis+add | → select+info+add |  |  |  |

#### F7

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| result | 화면 바뀜 | 리플레이 파일로 내보내기 | 리플레이 파일로 내보내기 F7 |  |
| result:details | 화면 바뀜 | 리플레이 파일로 내보내기 | 리플레이 파일로 내보내기 F7 |  |

#### F10

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → settings:speed |  | 설정 F10 |  |
| select+options:rules | → settings:speed |  | 설정 F10 |  |
| select+search | → settings:speed |  | 설정 F10 |  |
| select+add | → settings:speed |  | 설정 F10 |  |
| select+options:generation | → settings:speed |  | 설정 F10 |  |
| select+options:gear | → settings:speed |  | 설정 F10 |  |
| select+options:rules+search | → settings:speed |  | 설정 F10 |  |
| select+options:rules+add | → settings:speed |  | 설정 F10 |  |
| select+info+search | → settings:speed |  | 설정 F10 |  |
| select+info+add | → settings:speed |  | 설정 F10 |  |
| select+add+search | → settings:speed |  | 설정 F10 |  |
| select+options:generation+search | → settings:speed |  | 설정 F10 |  |
| select+options:generation+add | → settings:speed |  | 설정 F10 |  |
| select+options:gear+search | → settings:speed |  | 설정 F10 |  |
| select+options:gear+add | → settings:speed |  | 설정 F10 |  |
| select+first | → settings:speed |  | 설정 F10 |  |
| select+first+search | → settings:speed |  | 설정 F10 |  |
| select+first+add | → settings:speed |  | 설정 F10 |  |
| select+first+add+search | → settings:speed |  | 설정 F10 |  |
| select+offline | → settings:speed |  | 설정 F10 |  |
| select+offline+info | → settings:speed |  | 설정 F10 |  |
| select+offline+search | → settings:speed |  | 설정 F10 |  |
| select+offline+options:rules | → settings:speed |  | 설정 F10 |  |
| select+offline+info+search | → settings:speed |  | 설정 F10 |  |
| select+offline+options:generation | → settings:speed |  | 설정 F10 |  |
| select+offline+options:gear | → settings:speed |  | 설정 F10 |  |
| select+offline+options:rules+search | → settings:speed |  | 설정 F10 |  |
| select+offline+options:generation+search | → settings:speed |  | 설정 F10 |  |
| select+offline+options:gear+search | → settings:speed |  | 설정 F10 |  |
| select+info+youtube | → settings:speed |  | 설정 F10 |  |
| select+info+analysis+search | → settings:speed |  | 설정 F10 |  |
| select+info+youtube+add | → settings:speed |  | 설정 F10 |  |
| select+info+analysis+add | → settings:speed |  | 설정 F10 |  |
| select+info+youtube+search | → settings:speed |  | 설정 F10 |  |
| select+info+youtube+analysis | → settings:speed |  | 설정 F10 |  |
| select+info+analysis | → settings:speed |  | 설정 F10 |  |
| select+info+youtube+analysis+search | → settings:speed |  | 설정 F10 |  |
| select+info+youtube+analysis+add | → settings:speed |  | 설정 F10 |  |

#### wait:end

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| play:running | → result |  |  |  |

### 힌트가 말하는데 그 상태의 어느 포커스에서도 아무 일이 없던 키

| 상태 | 키 | 힌트 | 첫 포커스 |
|---|---|---|---|
| select | PgUp | 페이지 | (none) |
| select+search | PgUp | 페이지 | song-search |
| select+search | ← | 난이도 | song-search |
| select+search | → | 난이도 | song-search |
| select+search | Shift(단독) | 폴더 | song-search |
| select+add | PgUp | 페이지 | upload-button |
| select+add | PgDn | 페이지 | upload-button |
| select+add | ← | 난이도 | upload-button |
| select+add | → | 난이도 | upload-button |
| select+add | Shift(단독) | 폴더 | upload-button |
| select+add | Space | 플레이 옵션 | upload-button |
| select+add | I | 곡 정보·도구 | upload-button |
| select+options:rules+search | ← | 값 | song-search |
| select+options:rules+search | → | 값 | song-search |
| select+options:rules+add | ← | 값 | upload-button |
| select+options:rules+add | → | 값 | upload-button |
| select+options:rules+add | Q | 탭 | upload-button |
| select+options:rules+add | E | 탭 | upload-button |
| select+options:rules+add | Space | 플레이 옵션 닫기 | upload-button |
| select+options:rules+add | I | 곡 정보·도구 | upload-button |
| select+info+search | ← | 값 | song-search |
| select+info+search | → | 값 | song-search |
| select+info+add | ← | 값 | upload-button |
| select+info+add | → | 값 | upload-button |
| select+info+add | Space | 플레이 옵션 | upload-button |
| select+info+add | I | 곡 정보·도구 닫기 | upload-button |
| select+add+search | PgUp | 페이지 | song-search |
| select+add+search | ← | 난이도 | song-search |
| select+add+search | → | 난이도 | song-search |
| select+add+search | Shift(단독) | 폴더 | song-search |
| select+options:generation+search | ← | 값 | song-search |
| select+options:generation+search | → | 값 | song-search |
| select+options:generation+add | ← | 값 | upload-button |
| select+options:generation+add | → | 값 | upload-button |
| select+options:generation+add | Q | 탭 | upload-button |
| select+options:generation+add | E | 탭 | upload-button |
| select+options:generation+add | Space | 플레이 옵션 닫기 | upload-button |
| select+options:generation+add | I | 곡 정보·도구 | upload-button |
| select+options:gear+search | ← | 값 | song-search |
| select+options:gear+search | → | 값 | song-search |
| select+options:gear+add | ← | 값 | upload-button |
| select+options:gear+add | → | 값 | upload-button |
| select+options:gear+add | Q | 탭 | upload-button |
| select+options:gear+add | E | 탭 | upload-button |
| select+options:gear+add | Space | 플레이 옵션 닫기 | upload-button |
| select+options:gear+add | I | 곡 정보·도구 | upload-button |
| select+first+search | ↑ | 버튼 | song-search |
| select+first+search | ↓ | 버튼 | song-search |
| select+first+add | + | 곡 추가 | upload-button |
| select+first+add | Space | 플레이 옵션 | upload-button |
| select+first+add | I | 곡 정보·도구 | upload-button |
| select+first+add+search | ↑ | 버튼 | song-search |
| select+first+add+search | ↓ | 버튼 | song-search |
| select+offline+search | ← | 버튼 | song-search |
| select+offline+search | → | 버튼 | song-search |
| select+offline+info+search | ↑ | 항목 | song-search |
| select+offline+info+search | ↓ | 항목 | song-search |
| select+offline+info+search | ← | 값 | song-search |
| select+offline+info+search | → | 값 | song-search |
| select+offline+options:rules+search | ↑ | 항목 | song-search |
| select+offline+options:rules+search | ↓ | 항목 | song-search |
| select+offline+options:rules+search | ← | 값 | song-search |
| select+offline+options:rules+search | → | 값 | song-search |
| select+offline+options:generation+search | ↑ | 항목 | song-search |
| select+offline+options:generation+search | ↓ | 항목 | song-search |
| select+offline+options:generation+search | ← | 값 | song-search |
| select+offline+options:generation+search | → | 값 | song-search |
| select+offline+options:gear+search | ↑ | 항목 | song-search |
| select+offline+options:gear+search | ↓ | 항목 | song-search |
| select+offline+options:gear+search | ← | 값 | song-search |
| select+offline+options:gear+search | → | 값 | song-search |
| select+info+youtube | Shift+Enter | 오토 플레이 | bga-youtube-input |
| select+info+analysis+search | ← | 값 | song-search |
| select+info+analysis+search | → | 값 | song-search |
| select+info+youtube+add | ← | 값 | bga-youtube-input |
| select+info+youtube+add | → | 값 | bga-youtube-input |
| select+info+youtube+add | Enter | 고르기 | bga-youtube-input |
| select+info+analysis+add | ← | 값 | upload-button |
| select+info+analysis+add | → | 값 | upload-button |
| select+info+analysis+add | Space | 플레이 옵션 | upload-button |
| select+info+analysis+add | I | 곡 정보·도구 닫기 | upload-button |
| select+info+youtube+search | ← | 값 | song-search |
| select+info+youtube+search | → | 값 | song-search |
| select+info+youtube+analysis+search | ← | 값 | song-search |
| select+info+youtube+analysis+search | → | 값 | song-search |
| select+info+youtube+analysis+add | ← | 값 | upload-button |
| select+info+youtube+analysis+add | → | 값 | upload-button |
| select+info+youtube+analysis+add | Space | 플레이 옵션 | upload-button |
| select+info+youtube+analysis+add | I | 곡 정보·도구 닫기 | upload-button |

### 일을 하는데 힌트 바에도 화면의 키 표시에도 없는 키 (숨은 단축키)

| 상태 | 키 | 한 일 |
|---|---|---|
| select | Shift+Tab | 설정 lastKeyMode |
| select | End | 화면 바뀜 |
| select | Slash | → select+search |
| select | Ctrl+F | → select+search |
| select | F6 | 설정 songFolder |
| play:running | Esc | → play:paused |
| play:running | wait:end | → result |
| select+options:rules | Shift+Tab | 설정 lastKeyMode |
| select+options:rules | PgUp | → select+options:generation |
| select+options:rules | PgDn | → select+options:gear |
| select+options:rules | End | 포커스 → practice-toggle |
| select+options:rules | Slash | → select+options:rules+search |
| select+options:rules | Shift(단독) | 설정 songFolder |
| select+options:rules | Ctrl+F | → select+options:rules+search |
| select+options:rules | F3 | 설정 favorites |
| select+options:rules | F6 | 설정 songFolder |
| select+add | Slash | → select+search |
| select+add | Ctrl+F | → select+search |
| select+add | F6 | 설정 songFolder |
| settings:speed | PgUp | → settings:judge |
| settings:speed | PgDn | → settings:gear |
| play:paused | Space | → play:running |
| play:paused | Shift+R | → play:running |
| play:paused | Shift+Enter | → play:running |
| play:paused | F2 | → play:running |
| result | Esc | → select |
| result | Shift+R | → play:running |
| result | Shift+Enter | → select |
| result | F2 | → play:running |
| result | Shift+F5 | → play:running |
| select+options:generation | Shift+Tab | 설정 lastKeyMode |
| select+options:generation | PgUp | → select+options:gear |
| select+options:generation | PgDn | → select+options:rules |
| select+options:generation | End | 포커스 → generation-options>button[9]:생성 옵션 초기화 |
| select+options:generation | Slash | → select+options:generation+search |
| select+options:generation | Shift(단독) | 설정 songFolder |
| select+options:generation | Ctrl+F | → select+options:generation+search |
| select+options:generation | F3 | 설정 favorites |
| select+options:generation | F6 | 설정 songFolder |
| select+options:gear | Shift+Tab | 설정 lastKeyMode |
| select+options:gear | PgUp | → select+options:rules |
| select+options:gear | PgDn | → select+options:generation |
| select+options:gear | End | 포커스 → quick-key-beam |
| select+options:gear | Slash | → select+options:gear+search |
| select+options:gear | Shift(단독) | 설정 songFolder |
| select+options:gear | Ctrl+F | → select+options:gear+search |
| select+options:gear | F3 | 설정 favorites |
| select+options:gear | F6 | 설정 songFolder |
| settings:judge | PgUp | → settings:play |
| settings:judge | PgDn | → settings:speed |
| settings:judge | Shift+Enter | 설정 judgementMode |
| settings:gear | Enter | 설정 parts |
| settings:gear | PgUp | → settings:speed |
| settings:gear | PgDn | → settings:notes |
| settings:gear | Shift+Enter | 설정 parts |
| settings:advanced | PgUp | → settings:pad |
| settings:advanced | PgDn | → settings:play |
| settings:sound | PgUp | → settings:fx |
| settings:sound | PgDn | → settings:keys |
| settings:fx | PgUp | → settings:notes |
| settings:fx | PgDn | → settings:sound |
| settings:notes | PgUp | → settings:gear |
| settings:notes | PgDn | → settings:fx |
| settings:play | PgUp | → settings:advanced |
| settings:play | PgDn | → settings:judge |
| result:details | Shift+R | → play:running |
| result:details | Shift+Enter | → select |
| result:details | F2 | → play:running |
| result:details | Shift+F5 | → play:running |
| calibration:input | Space | → calibration:input+running |
| calibration:input | PgUp | → calibration:visual |
| calibration:input | PgDn | → calibration:visual |
| calibration:input | Shift+Enter | → calibration:input+running |
| calibration:visual | Space | 화면 바뀜 |
| calibration:visual | PgUp | → calibration:input |
| calibration:visual | PgDn | → calibration:input |
| calibration:visual | Shift+Enter | 화면 바뀜 |
| select+first | Shift+Tab | 설정 lastKeyMode |
| select+first | Slash | → select+first+search |
| select+first | Shift(단독) | 설정 songFolder |
| select+first | Ctrl+F | → select+first+search |
| select+first | F6 | 설정 songFolder |
| select+offline | Tab | 설정 lastKeyMode |
| select+offline | Shift+Tab | 설정 lastKeyMode |
| select+offline | I | → select+offline+info |
| select+offline | Slash | → select+offline+search |
| select+offline | Shift(단독) | 설정 songFolder |
| select+offline | Ctrl+F | → select+offline+search |
| select+offline | F6 | 설정 songFolder |

### 같은 키, 다른 이름 (힌트 바의 말 기준)

| 키 | 이름 수 | 이름들 | 화면 |
|---|---|---|---|
| Enter | 9 | 플레이 / 고르기 / 선곡으로 / 열기 / 누르기 / 지정 / 바꾸기 / 시작 / 저장 | select, result, settings, calibration |
| Esc | 6 | 닫기 / 완료 / 상세 닫기 / 돌아가기 / 취소 / 멈추기 | select, settings, result, calibration |
| ← | 5 | 난이도 / 값 / 레인 / 1ms / 버튼 | select, settings, calibration |
| → | 5 | 난이도 / 값 / 레인 / 1ms / 버튼 | select, settings, calibration |
| Space | 4 | 플레이 옵션 / 플레이 옵션 닫기 / 상세 / 상세 닫기 | select, result |
| ↑ | 4 | 곡 / 항목 / 모드 / 버튼 | select, settings |
| ↓ | 4 | 곡 / 항목 / 모드 / 버튼 | select, settings |
| Q | 2 | 탭 / 단계 | select, settings, calibration |
| E | 2 | 탭 / 단계 | select, settings, calibration |
| I | 2 | 곡 정보·도구 / 곡 정보·도구 닫기 | select |

### 브라우저의 기본 동작이 남는 키

페이지가 `preventDefault`하지 않은 키입니다. 브라우저에서 F5는 새로 고침, F3·Ctrl+F는 찾기, F1은 도움말, F11은 전체 화면, Tab은 브라우저 포커스 이동입니다 (데스크톱 앱에서는 메뉴가 없어 대부분 아무 일도 없습니다).

| 키 | 상태 수 | 상태 |
|---|---|---|
| Backspace | 58 | select, select+options:rules, select+info, select+search, select+add, settings:speed, play:paused, result, select+options:generation, select+options:gear, select+options:rules+search, select+options:rules+add, select+options:rules+practice, select+info+search, select+info+add, select+add+search, settings:judge, settings:gear, settings:advanced, settings:pad, settings:keys, settings:sound, settings:fx, settings:notes, settings:play, result:details, select+options:generation+search, select+options:generation+add, select+options:gear+search, select+options:gear+add, select+options:rules+practice+search, select+options:rules+practice+add, calibration:input, calibration:visual, settings:pad+capture, select+first, select+first+search, select+first+add, select+first+add+search, select+offline, select+offline+info, select+offline+search, select+offline+options:rules, select+offline+info+search, select+offline+options:generation, select+offline+options:gear, select+offline+options:rules+search, select+offline+options:generation+search, select+offline+options:gear+search, select+info+youtube, select+info+analysis+search, select+info+youtube+add, select+info+analysis+add, select+info+youtube+search, select+info+youtube+analysis, select+info+analysis, select+info+youtube+analysis+search, select+info+youtube+analysis+add |
| F1 | 57 | select, select+options:rules, select+info, select+search, select+add, settings:speed, play:paused, result, select+options:generation, select+options:gear, select+options:rules+search, select+options:rules+add, select+options:rules+practice, select+info+search, select+info+add, select+add+search, settings:judge, settings:gear, settings:advanced, settings:pad, settings:keys, settings:sound, settings:fx, settings:notes, settings:play, result:details, select+options:generation+search, select+options:generation+add, select+options:gear+search, select+options:gear+add, select+options:rules+practice+search, select+options:rules+practice+add, calibration:input, calibration:visual, select+first, select+first+search, select+first+add, select+first+add+search, select+offline, select+offline+info, select+offline+search, select+offline+options:rules, select+offline+info+search, select+offline+options:generation, select+offline+options:gear, select+offline+options:rules+search, select+offline+options:generation+search, select+offline+options:gear+search, select+info+youtube, select+info+analysis+search, select+info+youtube+add, select+info+analysis+add, select+info+youtube+search, select+info+youtube+analysis, select+info+analysis, select+info+youtube+analysis+search, select+info+youtube+analysis+add |
| F7 | 55 | select, select+options:rules, select+info, select+search, select+add, settings:speed, play:paused, select+options:generation, select+options:gear, select+options:rules+search, select+options:rules+add, select+options:rules+practice, select+info+search, select+info+add, select+add+search, settings:judge, settings:gear, settings:advanced, settings:pad, settings:keys, settings:sound, settings:fx, settings:notes, settings:play, select+options:generation+search, select+options:generation+add, select+options:gear+search, select+options:gear+add, select+options:rules+practice+search, select+options:rules+practice+add, calibration:input, calibration:visual, select+first, select+first+search, select+first+add, select+first+add+search, select+offline, select+offline+info, select+offline+search, select+offline+options:rules, select+offline+info+search, select+offline+options:generation, select+offline+options:gear, select+offline+options:rules+search, select+offline+options:generation+search, select+offline+options:gear+search, select+info+youtube, select+info+analysis+search, select+info+youtube+add, select+info+analysis+add, select+info+youtube+search, select+info+youtube+analysis, select+info+analysis, select+info+youtube+analysis+search, select+info+youtube+analysis+add |
| F11 | 57 | select, select+options:rules, select+info, select+search, select+add, settings:speed, play:paused, result, select+options:generation, select+options:gear, select+options:rules+search, select+options:rules+add, select+options:rules+practice, select+info+search, select+info+add, select+add+search, settings:judge, settings:gear, settings:advanced, settings:pad, settings:keys, settings:sound, settings:fx, settings:notes, settings:play, result:details, select+options:generation+search, select+options:generation+add, select+options:gear+search, select+options:gear+add, select+options:rules+practice+search, select+options:rules+practice+add, calibration:input, calibration:visual, select+first, select+first+search, select+first+add, select+first+add+search, select+offline, select+offline+info, select+offline+search, select+offline+options:rules, select+offline+info+search, select+offline+options:generation, select+offline+options:gear, select+offline+options:rules+search, select+offline+options:generation+search, select+offline+options:gear+search, select+info+youtube, select+info+analysis+search, select+info+youtube+add, select+info+analysis+add, select+info+youtube+search, select+info+youtube+analysis, select+info+analysis, select+info+youtube+analysis+search, select+info+youtube+analysis+add |
| Space | 41 | select+search, select+add, settings:speed, play:paused, select+options:rules+search, select+options:rules+add, select+info+search, select+info+add, select+add+search, settings:judge, settings:gear, settings:advanced, settings:pad, settings:keys, settings:sound, settings:fx, settings:notes, settings:play, select+options:generation+search, select+options:generation+add, select+options:gear+search, select+options:gear+add, select+options:rules+practice+search, select+options:rules+practice+add, calibration:input, calibration:visual, select+first+search, select+first+add, select+first+add+search, select+offline+search, select+offline+info+search, select+offline+options:rules+search, select+offline+options:generation+search, select+offline+options:gear+search, select+info+youtube, select+info+analysis+search, select+info+youtube+add, select+info+analysis+add, select+info+youtube+search, select+info+youtube+analysis+search, select+info+youtube+analysis+add |
| Tab | 43 | select+search, select+add, settings:speed, play:paused, result, select+options:rules+search, select+options:rules+add, select+info+search, select+info+add, select+add+search, settings:judge, settings:gear, settings:advanced, settings:pad, settings:keys, settings:sound, settings:fx, settings:notes, settings:play, result:details, select+options:generation+search, select+options:generation+add, select+options:gear+search, select+options:gear+add, select+options:rules+practice+search, select+options:rules+practice+add, calibration:input, calibration:visual, select+first+search, select+first+add, select+first+add+search, select+offline+search, select+offline+info+search, select+offline+options:rules+search, select+offline+options:generation+search, select+offline+options:gear+search, select+info+youtube, select+info+analysis+search, select+info+youtube+add, select+info+analysis+add, select+info+youtube+search, select+info+youtube+analysis+search, select+info+youtube+analysis+add |
| Shift+Tab | 43 | select+search, select+add, settings:speed, play:paused, result, select+options:rules+search, select+options:rules+add, select+info+search, select+info+add, select+add+search, settings:judge, settings:gear, settings:advanced, settings:pad, settings:keys, settings:sound, settings:fx, settings:notes, settings:play, result:details, select+options:generation+search, select+options:generation+add, select+options:gear+search, select+options:gear+add, select+options:rules+practice+search, select+options:rules+practice+add, calibration:input, calibration:visual, select+first+search, select+first+add, select+first+add+search, select+offline+search, select+offline+info+search, select+offline+options:rules+search, select+offline+options:generation+search, select+offline+options:gear+search, select+info+youtube, select+info+analysis+search, select+info+youtube+add, select+info+analysis+add, select+info+youtube+search, select+info+youtube+analysis+search, select+info+youtube+analysis+add |
| Slash | 34 | select+search, settings:speed, play:paused, result, select+options:rules+search, select+info+search, select+add+search, settings:judge, settings:gear, settings:advanced, settings:pad, settings:keys, settings:sound, settings:fx, settings:notes, settings:play, result:details, select+options:generation+search, select+options:gear+search, select+options:rules+practice+search, calibration:input, calibration:visual, select+first+search, select+first+add+search, select+offline+search, select+offline+info+search, select+offline+options:rules+search, select+offline+options:generation+search, select+offline+options:gear+search, select+info+youtube, select+info+analysis+search, select+info+youtube+add, select+info+youtube+search, select+info+youtube+analysis+search |
| Ctrl+F | 14 | settings:speed, result, settings:judge, settings:gear, settings:advanced, settings:pad, settings:keys, settings:sound, settings:fx, settings:notes, settings:play, result:details, calibration:input, calibration:visual |
| F2 | 12 | settings:speed, settings:judge, settings:gear, settings:advanced, settings:pad, settings:keys, settings:sound, settings:fx, settings:notes, settings:play, calibration:input, calibration:visual |
| F3 | 15 | settings:speed, play:paused, result, settings:judge, settings:gear, settings:advanced, settings:pad, settings:keys, settings:sound, settings:fx, settings:notes, settings:play, result:details, calibration:input, calibration:visual |
| F4 | 15 | settings:speed, play:paused, result, settings:judge, settings:gear, settings:advanced, settings:pad, settings:keys, settings:sound, settings:fx, settings:notes, settings:play, result:details, calibration:input, calibration:visual |
| F5 | 13 | settings:speed, play:paused, settings:judge, settings:gear, settings:advanced, settings:pad, settings:keys, settings:sound, settings:fx, settings:notes, settings:play, calibration:input, calibration:visual |
| F6 | 15 | settings:speed, play:paused, result, settings:judge, settings:gear, settings:advanced, settings:pad, settings:keys, settings:sound, settings:fx, settings:notes, settings:play, result:details, calibration:input, calibration:visual |
| F10 | 15 | settings:speed, play:paused, result, settings:judge, settings:gear, settings:advanced, settings:pad, settings:keys, settings:sound, settings:fx, settings:notes, settings:play, result:details, calibration:input, calibration:visual |

## 패드

### 입력마다

#### 패드 A

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 화면 바뀜 |  |  |  |
| select+options:rules | 화면 바뀜 | 플레이 |  |  |
| select+info | 화면 바뀜 | 플레이 |  |  |
| select+options:generation | 화면 바뀜 | 플레이 |  |  |
| select+options:gear | 화면 바뀜 | 플레이 |  |  |
| select+info+youtube |  | 플레이 |  | 브라우저 기본 동작 남음 |
| select+info+analysis | → select+info | 누르기 |  |  |
| calibration:input | → calibration:input+running | 시작 |  | 브라우저 기본 동작 남음 |
| calibration:visual | 화면 바뀜 | 저장 |  | 브라우저 기본 동작 남음 |
| settings:judge | 설정 judgementMode | 열기 |  |  |
| settings:gear | 설정 parts |  |  |  |
| select+info+youtube+analysis | → select+info+youtube | 누르기 |  |  |
| result | → select | 선곡으로 |  | 브라우저 기본 동작 남음 |
| settings:play | 설정 difficultySystem, lastDifficulty |  |  |  |

#### 패드 B

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+options:rules | → select | 닫기 |  | 브라우저 기본 동작 남음 |
| select+info | → select | 닫기 |  | 브라우저 기본 동작 남음 |
| settings:speed | → select | 완료 |  |  |
| select+options:generation | → select | 닫기 |  | 브라우저 기본 동작 남음 |
| select+options:gear | → select | 닫기 |  | 브라우저 기본 동작 남음 |
| select+info+youtube | → select+info | 닫기 |  | 브라우저 기본 동작 남음 |
| select+info+analysis | → select | 닫기 |  | 브라우저 기본 동작 남음 |
| calibration:input | → select | 돌아가기 |  |  |
| calibration:visual | → select | 돌아가기 |  |  |
| settings:judge | → select | 완료 |  |  |
| settings:gear | → select | 완료 |  |  |
| select+info+youtube+analysis | → select | 닫기 |  | 브라우저 기본 동작 남음 |
| result | → select |  |  |  |
| calibration:input+running | → calibration:input | 멈추기 |  |  |
| settings:play | → select | 완료 |  |  |

#### 패드 X

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → select+options:rules |  |  |  |
| select+options:rules | → select | 플레이 옵션 닫기 |  |  |
| select+info | → select+options:rules | 플레이 옵션 |  |  |
| select+options:generation | → select | 플레이 옵션 닫기 |  |  |
| select+options:gear | → select | 플레이 옵션 닫기 |  |  |
| select+info+youtube |  | 플레이 옵션 |  | 브라우저 기본 동작 남음 |
| select+info+analysis | → select+options:rules | 플레이 옵션 |  |  |
| select+info+youtube+analysis | → select+options:rules | 플레이 옵션 |  |  |
| result | → play:running | 다시 하기 |  |  |

#### 패드 Y

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 설정 lastKeyMode |  |  |  |
| select+options:rules | 설정 lastKeyMode |  |  |  |
| select+info | 설정 lastKeyMode · 포커스 → song-info>div[1]:채보를 계산하는 중…기록 · 4K+FX NO |  |  |  |
| settings:speed | 포커스 → opt-sudden |  |  | 브라우저 기본 동작 남음 |
| select+options:generation | 설정 lastKeyMode |  |  |  |
| select+options:gear | 설정 lastKeyMode |  |  |  |
| select+info+youtube | 포커스 → bga-youtube-form>button[0]:취소 |  |  | 브라우저 기본 동작 남음 |
| select+info+analysis | 설정 lastKeyMode |  |  |  |
| calibration:input | 포커스 → calib-next |  |  | 브라우저 기본 동작 남음 |
| calibration:visual | 포커스 → calib-back |  |  | 브라우저 기본 동작 남음 |
| settings:judge | 포커스 → opt-input-offset |  |  | 브라우저 기본 동작 남음 |
| settings:gear | 포커스 → opt-hud-type |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis | 설정 lastKeyMode |  |  |  |
| result | 포커스 → result-retry |  |  | 브라우저 기본 동작 남음 |
| settings:play | 포커스 → opt-ruleset |  |  | 브라우저 기본 동작 남음 |

#### 패드 LB

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+options:rules | → select+options:generation | 탭 |  |  |
| settings:speed | → settings:judge | 탭 |  |  |
| select+options:generation | → select+options:gear | 탭 |  |  |
| select+options:gear | → select+options:rules | 탭 |  |  |
| calibration:input | → calibration:visual | 단계 |  |  |
| calibration:visual | → calibration:input | 단계 |  |  |
| settings:judge | → settings:play | 탭 |  |  |
| settings:gear | → settings:speed | 탭 |  |  |
| settings:play | → settings:advanced | 탭 |  |  |

#### 패드 RB

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 화면 바뀜 |  |  |  |
| select+options:rules | → select+options:gear | 탭 |  |  |
| settings:speed | → settings:gear | 탭 |  |  |
| select+options:generation | → select+options:rules | 탭 |  |  |
| select+options:gear | → select+options:generation | 탭 |  |  |
| calibration:input | → calibration:visual | 단계 |  |  |
| calibration:visual | → calibration:input | 단계 |  |  |
| settings:judge | → settings:speed | 탭 |  |  |
| settings:gear | → settings:notes | 탭 |  |  |
| settings:play | → settings:judge | 탭 |  |  |

#### 패드 LT

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → select+info |  |  | 브라우저 기본 동작 남음 |
| select+options:rules | → select+info | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+info | → select | 곡 정보·도구 닫기 |  | 브라우저 기본 동작 남음 |
| select+options:generation | → select+info | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+options:gear | → select+info | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+info+youtube |  | 곡 정보·도구 닫기 |  | 브라우저 기본 동작 남음 |
| select+info+analysis | → select | 곡 정보·도구 닫기 |  | 브라우저 기본 동작 남음 |
| select+info+youtube+analysis | → select | 곡 정보·도구 닫기 |  | 브라우저 기본 동작 남음 |

#### 패드 RT

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → settings:speed |  |  |  |
| select+options:rules | → settings:speed |  |  |  |
| select+info | → settings:speed |  |  |  |
| select+options:generation | → settings:speed |  |  |  |
| select+options:gear | → settings:speed |  |  |  |
| select+info+youtube | → settings:speed |  |  |  |
| select+info+analysis | → settings:speed |  |  |  |
| select+info+youtube+analysis | → settings:speed |  |  |  |

#### 패드 Back

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+options:rules | → select |  |  | 브라우저 기본 동작 남음 |
| select+info | → select |  |  | 브라우저 기본 동작 남음 |
| settings:speed | → select |  |  |  |
| select+options:generation | → select |  |  | 브라우저 기본 동작 남음 |
| select+options:gear | → select |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube | → select+info |  |  | 브라우저 기본 동작 남음 |
| select+info+analysis | → select |  |  | 브라우저 기본 동작 남음 |
| calibration:input | → select |  |  |  |
| calibration:visual | → select |  |  |  |
| settings:judge | → select |  |  |  |
| settings:gear | → select |  |  |  |
| select+info+youtube+analysis | → select |  |  | 브라우저 기본 동작 남음 |
| result | → select |  |  |  |
| settings:play | → select |  |  |  |

#### 패드 Start

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 화면 바뀜 |  |  |  |
| select+options:rules | 화면 바뀜 |  |  |  |
| select+info | 화면 바뀜 |  |  |  |
| select+options:generation | 화면 바뀜 |  |  |  |
| select+options:gear | 화면 바뀜 |  |  |  |
| select+info+analysis | → select+info |  |  |  |
| calibration:input | → calibration:input+running |  |  | 브라우저 기본 동작 남음 |
| calibration:visual | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| settings:judge | 설정 judgementMode |  |  |  |
| settings:gear | 설정 parts |  |  |  |
| select+info+youtube+analysis | → select+info+youtube |  |  |  |
| result | → select |  |  | 브라우저 기본 동작 남음 |
| settings:play | 설정 difficultySystem, lastDifficulty |  |  |  |

#### 패드 RS

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 화면 바뀜 |  |  |  |
| select+options:rules | 화면 바뀜 | 오토 플레이 |  |  |
| select+info | 화면 바뀜 | 오토 플레이 |  |  |
| select+options:generation | 화면 바뀜 | 오토 플레이 |  |  |
| select+options:gear | 화면 바뀜 | 오토 플레이 |  |  |
| select+info+youtube |  | 오토 플레이 |  | 브라우저 기본 동작 남음 |
| select+info+analysis | 화면 바뀜 |  |  |  |
| select+info+youtube+analysis | 화면 바뀜 |  |  |  |

#### 패드 Up

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 화면 바뀜 | 곡 |  |  |
| select+options:rules | 포커스 → toggle-rules | 항목 |  |  |
| select+info | 포커스 → song-info>button[2]:×2 | 항목 |  |  |
| settings:speed |  | 항목 |  |  |
| select+options:generation | 포커스 → toggle-generation | 항목 |  |  |
| select+options:gear | 포커스 → toggle-gear | 항목 |  |  |
| select+info+youtube | 포커스 → bga-youtube | 항목 |  | 브라우저 기본 동작 남음 |
| select+info+analysis | 포커스 → edit-sections | 항목 |  |  |
| calibration:input | 포커스 → calib-step-visual |  |  | 브라우저 기본 동작 남음 |
| calibration:visual | 포커스 → calib-step-visual |  |  | 브라우저 기본 동작 남음 |
| settings:judge |  | 항목 |  |  |
| settings:gear |  | 항목 |  |  |
| select+info+youtube+analysis | 포커스 → edit-sections | 항목 |  |  |
| result | 포커스 → result-details |  |  | 브라우저 기본 동작 남음 |
| settings:play |  | 항목 |  |  |

#### 패드 Down

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 화면 바뀜 | 곡 |  |  |
| select+options:rules | 포커스 → rule-gauge | 항목 |  |  |
| select+info | 포커스 → song-info>button[2]:×2 | 항목 |  |  |
| settings:speed | 포커스 → opt-sudden | 항목 |  |  |
| select+options:generation | 포커스 → generation-options>button[0]:자동 | 항목 |  |  |
| select+options:gear | 포커스 → quick-sudden | 항목 |  |  |
| select+info+youtube | 포커스 → bga-youtube-form>button[0]:취소 | 항목 |  | 브라우저 기본 동작 남음 |
| select+info+analysis | 포커스 → sync-auto | 항목 |  |  |
| calibration:input | 포커스 → calib-next |  |  | 브라우저 기본 동작 남음 |
| calibration:visual | 포커스 → calib-back |  |  | 브라우저 기본 동작 남음 |
| settings:judge | 포커스 → opt-input-offset | 항목 |  |  |
| settings:gear | 포커스 → opt-hud-type | 항목 |  |  |
| select+info+youtube+analysis | 포커스 → sync-auto | 항목 |  |  |
| result | 포커스 → result-retry |  |  | 브라우저 기본 동작 남음 |
| settings:play | 포커스 → opt-ruleset | 항목 |  |  |

#### 패드 Left

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 설정 lastDifficulty | 난이도 |  |  |
| select+options:rules | 설정 placement | 값 |  |  |
| select+info | 포커스 → song-info>button[2]:×2 | 값 |  |  |
| settings:speed | 설정 hiSpeed | 값 |  |  |
| select+options:generation | 설정 generation · 포커스 → style-melody | 값 |  |  |
| select+options:gear | 설정 hiSpeed | 값 |  |  |
| select+info+youtube | 포커스 → bga-youtube | 값 |  | 브라우저 기본 동작 남음 |
| select+info+analysis |  | 값 |  |  |
| calibration:input | 포커스 → calib-step-visual |  |  | 브라우저 기본 동작 남음 |
| calibration:visual | 화면 바뀜 | 1ms |  |  |
| settings:judge | 설정 judgementMode | 값 |  |  |
| settings:gear | 설정 parts | 값 |  |  |
| select+info+youtube+analysis |  | 값 |  |  |
| result | 포커스 → result-details |  |  | 브라우저 기본 동작 남음 |
| settings:play | 설정 difficultySystem, lastDifficulty | 값 |  |  |

#### 패드 Right

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 설정 lastDifficulty | 난이도 |  |  |
| select+options:rules | 설정 placement | 값 |  |  |
| select+info | 포커스 → song-info>button[2]:×2 | 값 |  |  |
| settings:speed | 설정 hiSpeed | 값 |  |  |
| select+options:generation | 설정 generation · 포커스 → style-stream | 값 |  |  |
| select+options:gear | 설정 hiSpeed | 값 |  |  |
| select+info+youtube | 포커스 → bga-youtube-form>button[0]:취소 | 값 |  | 브라우저 기본 동작 남음 |
| select+info+analysis | 포커스 → remove-song | 값 |  |  |
| calibration:input | 포커스 → calib-next |  |  | 브라우저 기본 동작 남음 |
| calibration:visual | 화면 바뀜 | 1ms |  |  |
| settings:judge | 설정 judgementMode | 값 |  |  |
| settings:gear | 설정 parts | 값 |  |  |
| select+info+youtube+analysis | 포커스 → remove-song | 값 |  |  |
| result | 포커스 → result-retry |  |  | 브라우저 기본 동작 남음 |
| settings:play | 설정 difficultySystem, lastDifficulty | 값 |  |  |

#### wait:end

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| play:running | → result |  |  |  |

### 힌트가 말하는데 그 상태의 어느 포커스에서도 아무 일이 없던 키

| 상태 | 키 | 힌트 | 첫 포커스 |
|---|---|---|---|
| select+info+youtube | 패드 X | 플레이 옵션 | bga-youtube-input |
| select+info+youtube | 패드 LT | 곡 정보·도구 닫기 | bga-youtube-input |
| select+info+youtube | 패드 RS | 오토 플레이 | bga-youtube-input |

### 일을 하는데 힌트 바에도 화면의 키 표시에도 없는 키 (숨은 단축키)

| 상태 | 키 | 한 일 |
|---|---|---|
| select | 패드 A | 화면 바뀜 |
| select | 패드 X | → select+options:rules |
| select | 패드 Y | 설정 lastKeyMode |
| select | 패드 RB | 화면 바뀜 |
| select | 패드 LT | → select+info |
| select | 패드 RT | → settings:speed |
| select | 패드 Start | 화면 바뀜 |
| select | 패드 RS | 화면 바뀜 |
| select+options:rules | 패드 Y | 설정 lastKeyMode |
| select+options:rules | 패드 RT | → settings:speed |
| select+options:rules | 패드 Back | → select |
| select+options:rules | 패드 Start | 화면 바뀜 |
| select+info | 패드 Y | 설정 lastKeyMode · 포커스 → song-info>div[1]:채보를 계산하는 중…기록 · 4K+FX NO |
| select+info | 패드 RT | → settings:speed |
| select+info | 패드 Back | → select |
| select+info | 패드 Start | 화면 바뀜 |
| settings:speed | 패드 Y | 포커스 → opt-sudden |
| settings:speed | 패드 Back | → select |
| select+options:generation | 패드 Y | 설정 lastKeyMode |
| select+options:generation | 패드 RT | → settings:speed |
| select+options:generation | 패드 Back | → select |
| select+options:generation | 패드 Start | 화면 바뀜 |
| select+options:gear | 패드 Y | 설정 lastKeyMode |
| select+options:gear | 패드 RT | → settings:speed |
| select+options:gear | 패드 Back | → select |
| select+options:gear | 패드 Start | 화면 바뀜 |
| play:running | wait:end | → result |
| calibration:input | 패드 Y | 포커스 → calib-next |
| calibration:input | 패드 Back | → select |
| calibration:input | 패드 Start | → calibration:input+running |
| calibration:visual | 패드 Y | 포커스 → calib-back |
| calibration:visual | 패드 Back | → select |
| calibration:visual | 패드 Start | 화면 바뀜 |
| settings:judge | 패드 Y | 포커스 → opt-input-offset |
| settings:judge | 패드 Back | → select |
| settings:judge | 패드 Start | 설정 judgementMode |
| settings:gear | 패드 A | 설정 parts |
| settings:gear | 패드 Y | 포커스 → opt-hud-type |
| settings:gear | 패드 Back | → select |
| settings:gear | 패드 Start | 설정 parts |
| result | 패드 B | → select |
| result | 패드 Y | 포커스 → result-retry |
| result | 패드 Back | → select |
| result | 패드 Start | → select |
| settings:play | 패드 A | 설정 difficultySystem, lastDifficulty |
| settings:play | 패드 Y | 포커스 → opt-ruleset |
| settings:play | 패드 Back | → select |
| settings:play | 패드 Start | 설정 difficultySystem, lastDifficulty |

### 같은 키, 다른 이름 (힌트 바의 말 기준)

| 키 | 이름 수 | 이름들 | 화면 |
|---|---|---|---|
| 패드 A | 6 | 플레이 / 누르기 / 시작 / 저장 / 열기 / 선곡으로 | select, calibration, settings, result |
| 패드 B | 4 | 닫기 / 완료 / 돌아가기 / 멈추기 | select, settings, calibration |
| 패드 X | 3 | 플레이 옵션 닫기 / 플레이 옵션 / 다시 하기 | select, result |
| 패드 Left | 3 | 난이도 / 값 / 1ms | select, settings, calibration |
| 패드 Right | 3 | 난이도 / 값 / 1ms | select, settings, calibration |
| 패드 LB | 2 | 탭 / 단계 | select, settings, calibration |
| 패드 RB | 2 | 탭 / 단계 | select, settings, calibration |
| 패드 LT | 2 | 곡 정보·도구 / 곡 정보·도구 닫기 | select |
| 패드 Up | 2 | 곡 / 항목 | select, settings |
| 패드 Down | 2 | 곡 / 항목 | select, settings |
