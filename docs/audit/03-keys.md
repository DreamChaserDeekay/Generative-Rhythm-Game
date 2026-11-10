# 키와 버튼: 화면마다 하는 일

전환 그래프의 1단계 입력(각 상태의 첫 포커스에서 누른 모든 키)에서 뽑았습니다. 빈칸은 아무 일도 없었다는 뜻입니다.

## 키보드

### 입력마다

#### Esc

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| play:running | → play:paused |  |  |  |
| select+options:rules | → select | 닫기 | 닫기 Esc | 브라우저 기본 동작 남음 |
| select+info | → select | 닫기 | 닫기 Esc | 브라우저 기본 동작 남음 |
| select+search | → select |  |  |  |
| select+add | → select | 닫기 |  | 브라우저 기본 동작 남음 |
| settings:speed | → select | 완료 | 완료 Esc |  |
| play:paused | → play:running |  | 계속하기 Esc |  |
| select+options:generation | → select | 닫기 | 닫기 Esc | 브라우저 기본 동작 남음 |

#### Enter

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → play:running | 플레이 | 플레이 Enter |  |
| select+options:rules | → play:running | 플레이 | 플레이 Enter |  |
| select+info | → play:running | 플레이 | 플레이 Enter |  |
| select+search | → select | 플레이 | 플레이 Enter |  |
| select+add | → select | 고르기 | 플레이 Enter | 브라우저 기본 동작 남음 |
| play:paused | → play:running |  | Enter 건너뛰기 | 브라우저 기본 동작 남음 |
| select+options:generation | 화면 바뀜 | 플레이 | 플레이 Enter |  |

#### Space

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → select+options:rules | 플레이 옵션 |  |  |
| select+options:rules | → select | 플레이 옵션 닫기 |  |  |
| select+info | → select+options:rules | 플레이 옵션 |  |  |
| select+search | 화면 바뀜 | 플레이 옵션 |  | 브라우저 기본 동작 남음 |
| select+add |  | 플레이 옵션 |  | 브라우저 기본 동작 남음 |
| play:paused | → play:running |  |  | 브라우저 기본 동작 남음 |
| select+options:generation | → select | 플레이 옵션 닫기 |  |  |

#### Tab

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 설정 lastKeyMode | 키 모드 | 4K4K+FX5K6K6K+FX7K+1S8KTab |  |
| select+options:rules | 설정 lastKeyMode |  | 4K4K+FX5K6K6K+FX7K+1S8KTab |  |
| select+info | 설정 lastKeyMode · 포커스 → song-info>div[1]:채보를 계산하는 중…기록 · 4K+FX NO |  | 4K4K+FX5K6K6K+FX7K+1S8KTab |  |
| select+search | → select | 키 모드 | 4K4K+FX5K6K6K+FX7K+1S8KTab | 브라우저 기본 동작 남음 |
| select+add | 포커스 → demo-button | 키 모드 | 4K4K+FX5K6K6K+FX7K+1S8KTab | 브라우저 기본 동작 남음 |
| settings:speed | 포커스 → opt-sudden |  |  | 브라우저 기본 동작 남음 |
| play:paused | 포커스 → pause-menu>button[1]:다시 하기 R |  |  | 브라우저 기본 동작 남음 |
| select+options:generation | 설정 lastKeyMode |  | 4K4K+FX5K6K6K+FX7K+1S8KTab |  |

#### Shift+Tab

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 설정 lastKeyMode |  |  |  |
| select+options:rules | 설정 lastKeyMode |  |  |  |
| select+info | 설정 lastKeyMode · 포커스 → song-info>div[1]:채보를 계산하는 중…기록 · 8K NORMA |  |  |  |
| select+search | → select |  |  | 브라우저 기본 동작 남음 |
| select+add | 포커스 → add-menu |  |  | 브라우저 기본 동작 남음 |
| settings:speed | 포커스 → settings-tab-advanced |  |  | 브라우저 기본 동작 남음 |
| play:paused | 포커스 → (none) |  |  | 브라우저 기본 동작 남음 |
| select+options:generation | 설정 lastKeyMode |  |  |  |

#### ↑

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select |  | 곡 |  |  |
| select+options:rules | 포커스 → toggle-rules | 항목 |  |  |
| select+info | 포커스 → edit-chart | 항목 |  |  |
| select+search |  | 곡 |  |  |
| select+add | 포커스 → open-replay | 곡 |  |  |
| settings:speed |  | 항목 |  |  |
| play:paused | 포커스 → pause-menu>button[2]:나가기 Q |  |  |  |
| select+options:generation | 포커스 → toggle-generation | 항목 |  |  |

#### ↓

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select |  | 곡 |  |  |
| select+options:rules | 포커스 → rule-gauge | 항목 |  |  |
| select+info | 포커스 → edit-chart | 항목 |  |  |
| select+search |  | 곡 |  |  |
| select+add | 포커스 → demo-button | 곡 |  |  |
| settings:speed | 포커스 → opt-sudden | 항목 |  |  |
| play:paused | 포커스 → pause-menu>button[1]:다시 하기 R |  |  |  |
| select+options:generation | 포커스 → generation-options>button[0]:자동 | 항목 |  |  |

#### ←

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 설정 lastDifficulty | 난이도 |  |  |
| select+options:rules | 설정 placement | 값 |  |  |
| select+info | 포커스 → edit-chart | 값 |  |  |
| select+search |  | 난이도 |  | 브라우저 기본 동작 남음 |
| select+add |  | 난이도 |  | 브라우저 기본 동작 남음 |
| settings:speed | 설정 hiSpeed | 값 |  |  |
| select+options:generation | 설정 generation · 포커스 → style-melody | 값 |  |  |

#### →

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 설정 lastDifficulty | 난이도 |  |  |
| select+options:rules | 설정 placement | 값 |  |  |
| select+info | 포커스 → edit-chart | 값 |  |  |
| select+search |  | 난이도 |  | 브라우저 기본 동작 남음 |
| select+add |  | 난이도 |  | 브라우저 기본 동작 남음 |
| settings:speed | 설정 hiSpeed | 값 |  |  |
| select+options:generation | 설정 generation · 포커스 → style-stream | 값 |  |  |

#### PgUp

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select |  | 페이지 |  |  |
| select+options:rules | → select+options:generation |  |  |  |
| select+search |  | 페이지 |  |  |
| select+add |  | 페이지 |  | 브라우저 기본 동작 남음 |
| settings:speed | → settings:judge |  |  |  |
| select+options:generation | → select+options:gear |  |  |  |

#### PgDn

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select |  | 페이지 |  |  |
| select+options:rules | → select+options:gear |  |  |  |
| select+search |  | 페이지 |  |  |
| select+add |  | 페이지 |  | 브라우저 기본 동작 남음 |
| settings:speed | → settings:gear |  |  |  |
| select+options:generation | → select+options:rules |  |  |  |

#### Home

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+info | 포커스 → edit-chart |  |  |  |

#### End

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+options:rules | 포커스 → practice-toggle |  |  |  |
| select+info | 포커스 → sync-auto |  |  |  |
| select+options:generation | 포커스 → generation-options>button[9]:생성 옵션 초기화 |  |  |  |

#### Q

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+options:rules | → select+options:generation | 탭 |  |  |
| select+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| settings:speed | → settings:judge | 탭 | QE 탭 이동 |  |
| play:paused | → select |  | 나가기 Q | 브라우저 기본 동작 남음 |
| select+options:generation | → select+options:gear | 탭 |  |  |

#### E

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+options:rules | → select+options:gear | 탭 |  |  |
| select+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| settings:speed | → settings:gear | 탭 | QE 탭 이동 |  |
| select+options:generation | → select+options:rules | 탭 |  |  |

#### R

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| play:paused | → play:running |  | 다시 하기 R | 브라우저 기본 동작 남음 |

#### Shift+R

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| play:paused | → play:running |  |  | 브라우저 기본 동작 남음 |

#### I

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → select+info | 곡 정보·도구 | 정보·도구 I | 브라우저 기본 동작 남음 |
| select+options:rules | → select+info | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+info | → select | 곡 정보·도구 닫기 |  | 브라우저 기본 동작 남음 |
| select+search | 화면 바뀜 | 곡 정보·도구 | 정보·도구 I | 브라우저 기본 동작 남음 |
| select+add |  | 곡 정보·도구 | 정보·도구 I | 브라우저 기본 동작 남음 |
| select+options:generation | → select+info | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |

#### F

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |

#### M

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |

#### T

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |

#### P

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |

#### Slash

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → select+search |  |  |  |
| select+options:rules | → select+options:rules+search |  |  |  |
| select+info | → select+info+search |  |  |  |
| select+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| select+add | → select+search |  |  |  |
| select+options:generation | → select+options:generation+search |  |  |  |

#### +

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → select+add |  | 곡 추가 + |  |
| select+options:rules | → select+options:rules+add |  | 곡 추가 + |  |
| select+info | → select+info+add |  | 곡 추가 + |  |
| select+search | 화면 바뀜 |  | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+add |  |  | 곡 추가 + | 브라우저 기본 동작 남음 |
| select+options:generation | → select+options:generation+add |  | 곡 추가 + |  |

#### Minus

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+search | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |

#### Shift(단독)

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 설정 songFolder | 폴더 |  | 브라우저 기본 동작 남음 |
| select+options:rules | 설정 songFolder |  |  | 브라우저 기본 동작 남음 |
| select+info | 설정 songFolder · 포커스 → song-info>div[1]:도구싱크 테스트싱크 테스트 · 직접 치기판정 |  |  | 브라우저 기본 동작 남음 |
| select+search |  | 폴더 |  | 브라우저 기본 동작 남음 |
| select+add |  | 폴더 |  | 브라우저 기본 동작 남음 |
| select+options:generation | 설정 songFolder |  |  | 브라우저 기본 동작 남음 |

#### Shift+Enter

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → play:running | 오토 플레이 | 오토 플레이 Shift+Enter |  |
| select+options:rules | → play:running | 오토 플레이 |  |  |
| select+info | → play:running | 오토 플레이 |  |  |
| select+search | → select | 오토 플레이 | 오토 플레이 Shift+Enter |  |
| select+add |  |  | 오토 플레이 Shift+Enter |  |
| play:paused | → play:running |  |  | 브라우저 기본 동작 남음 |
| select+options:generation | 화면 바뀜 | 오토 플레이 |  |  |

#### Ctrl+F

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → select+search |  |  |  |
| select+options:rules | → select+options:rules+search |  |  |  |
| select+info | → select+info+search |  |  |  |
| select+add | → select+search |  |  |  |
| select+options:generation | → select+options:generation+search |  |  |  |

#### F2

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select |  | 랜덤 |  |  |
| select+search |  | 랜덤 |  |  |
| select+add |  | 랜덤 |  |  |
| play:paused | → play:running |  |  |  |

#### F3

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 설정 favorites | 즐겨찾기 | 즐겨찾기 F3 |  |
| select+options:rules | 설정 favorites |  |  |  |
| select+info | 설정 favorites |  |  |  |
| select+search | 설정 favorites | 즐겨찾기 | 즐겨찾기 F3 |  |
| select+add | 설정 favorites | 즐겨찾기 | 즐겨찾기 F3 |  |
| select+options:generation | 설정 favorites |  |  |  |

#### F4

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 설정 songSort |  | 추가순 F4 |  |
| select+options:rules | 설정 songSort |  | 추가순 F4 |  |
| select+info | 설정 songSort |  | 추가순 F4 |  |
| select+search | 설정 songSort |  | 추가순 F4 |  |
| select+add | 설정 songSort |  | 추가순 F4 |  |
| select+options:generation | 설정 songSort |  | 추가순 F4 |  |

#### F5

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 설정 patterns |  | 새 패턴 F5 |  |
| select+options:rules | 설정 patterns |  | 새 패턴 F5 |  |
| select+info | 설정 patterns · 포커스 → song-info>div[1]:채보 정보노트 83롱노트 9평균 / 최대 N |  | 새 패턴 F5 |  |
| select+search | 설정 patterns |  | 새 패턴 F5 |  |
| select+add | 설정 patterns |  | 새 패턴 F5 |  |
| select+options:generation | 화면 바뀜 |  | 새 패턴 F5 |  |

#### F6

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 설정 songFolder |  |  |  |
| select+options:rules | 설정 songFolder |  |  |  |
| select+info | 설정 songFolder · 포커스 → song-info>div[1]:도구싱크 테스트싱크 테스트 · 직접 치기판정 |  |  |  |
| select+search | 설정 songFolder |  |  |  |
| select+add | 설정 songFolder |  |  |  |
| select+options:generation | 설정 songFolder |  |  |  |

#### F10

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → settings:speed |  | 설정 F10 |  |
| select+options:rules | → settings:speed |  | 설정 F10 |  |
| select+info | → settings:speed |  | 설정 F10 |  |
| select+search | → settings:speed |  | 설정 F10 |  |
| select+add | → settings:speed |  | 설정 F10 |  |
| select+options:generation | → settings:speed |  | 설정 F10 |  |

#### wait:end

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| play:running | → result |  |  |  |

### 힌트가 말하는데 첫 포커스에서 아무 일도 없던 키

| 상태 | 키 | 힌트 | 첫 포커스 |
|---|---|---|---|
| select | ↑ | 곡 | (none) |
| select | ↓ | 곡 | (none) |
| select | PgUp | 페이지 | (none) |
| select | PgDn | 페이지 | (none) |
| select | F2 | 랜덤 | (none) |
| select+search | ↑ | 곡 | song-search |
| select+search | ↓ | 곡 | song-search |
| select+search | PgUp | 페이지 | song-search |
| select+search | PgDn | 페이지 | song-search |
| select+search | ← | 난이도 | song-search |
| select+search | → | 난이도 | song-search |
| select+search | Shift(단독) | 폴더 | song-search |
| select+search | F2 | 랜덤 | song-search |
| select+add | PgUp | 페이지 | upload-button |
| select+add | PgDn | 페이지 | upload-button |
| select+add | ← | 난이도 | upload-button |
| select+add | → | 난이도 | upload-button |
| select+add | Shift(단독) | 폴더 | upload-button |
| select+add | Space | 플레이 옵션 | upload-button |
| select+add | I | 곡 정보·도구 | upload-button |
| select+add | F2 | 랜덤 | upload-button |
| settings:speed | ↑ | 항목 | opt-hi-speed |

### 일을 하는데 힌트 바에도 화면의 키 표시에도 없는 키 (숨은 단축키)

| 상태 | 키 | 한 일 |
|---|---|---|
| select | Shift+Tab | 설정 lastKeyMode |
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
| select+info | Shift+Tab | 설정 lastKeyMode · 포커스 → song-info>div[1]:채보를 계산하는 중…기록 · 8K NORMA |
| select+info | Home | 포커스 → edit-chart |
| select+info | End | 포커스 → sync-auto |
| select+info | Slash | → select+info+search |
| select+info | Shift(단독) | 설정 songFolder · 포커스 → song-info>div[1]:도구싱크 테스트싱크 테스트 · 직접 치기판정 |
| select+info | Ctrl+F | → select+info+search |
| select+info | F3 | 설정 favorites |
| select+info | F6 | 설정 songFolder · 포커스 → song-info>div[1]:도구싱크 테스트싱크 테스트 · 직접 치기판정 |
| select+search | Esc | → select |
| select+search | Shift+Tab | → select |
| select+search | Q | 화면 바뀜 |
| select+search | E | 화면 바뀜 |
| select+search | R | 화면 바뀜 |
| select+search | Shift+R | 화면 바뀜 |
| select+search | F | 화면 바뀜 |
| select+search | M | 화면 바뀜 |
| select+search | T | 화면 바뀜 |
| select+search | P | 화면 바뀜 |
| select+search | Slash | 화면 바뀜 |
| select+search | Minus | 화면 바뀜 |
| select+search | F6 | 설정 songFolder |
| select+add | Slash | → select+search |
| select+add | Ctrl+F | → select+search |
| select+add | F6 | 설정 songFolder |
| settings:speed | PgUp | → settings:judge |
| settings:speed | PgDn | → settings:gear |
| play:paused | Space | → play:running |
| play:paused | Shift+R | → play:running |
| play:paused | Shift+Enter | → play:running |
| play:paused | F2 | → play:running |
| select+options:generation | Shift+Tab | 설정 lastKeyMode |
| select+options:generation | PgUp | → select+options:gear |
| select+options:generation | PgDn | → select+options:rules |
| select+options:generation | End | 포커스 → generation-options>button[9]:생성 옵션 초기화 |
| select+options:generation | Slash | → select+options:generation+search |
| select+options:generation | Shift(단독) | 설정 songFolder |
| select+options:generation | Ctrl+F | → select+options:generation+search |
| select+options:generation | F3 | 설정 favorites |
| select+options:generation | F6 | 설정 songFolder |

### 같은 키, 다른 이름 (힌트 바의 말 기준)

| 키 | 이름 수 | 이름들 | 화면 |
|---|---|---|---|
| Esc | 2 | 닫기 / 완료 | select, settings |
| Enter | 2 | 플레이 / 고르기 | select |
| Space | 2 | 플레이 옵션 / 플레이 옵션 닫기 | select |
| ↑ | 2 | 곡 / 항목 | select, settings |
| ↓ | 2 | 곡 / 항목 | select, settings |
| ← | 2 | 난이도 / 값 | select, settings |
| → | 2 | 난이도 / 값 | select, settings |
| I | 2 | 곡 정보·도구 / 곡 정보·도구 닫기 | select |

### 브라우저의 기본 동작이 남는 키

페이지가 `preventDefault`하지 않은 키입니다. 브라우저에서 F5는 새로 고침, F3·Ctrl+F는 찾기, F1은 도움말, F11은 전체 화면, Tab은 브라우저 포커스 이동입니다 (데스크톱 앱에서는 메뉴가 없어 대부분 아무 일도 없습니다).

| 키 | 상태 수 | 상태 |
|---|---|---|
| Backspace | 9 | select, select+options:rules, select+info, select+search, select+add, settings:speed, play:paused, result, select+options:generation |
| F1 | 9 | select, select+options:rules, select+info, select+search, select+add, settings:speed, play:paused, result, select+options:generation |
| F7 | 8 | select, select+options:rules, select+info, select+search, select+add, settings:speed, play:paused, select+options:generation |
| F11 | 8 | select, select+options:rules, select+info, select+search, select+add, settings:speed, play:paused, select+options:generation |
| Space | 4 | select+search, select+add, settings:speed, play:paused |
| Tab | 5 | select+search, select+add, settings:speed, play:paused, result |
| Shift+Tab | 5 | select+search, select+add, settings:speed, play:paused, result |
| Slash | 4 | select+search, settings:speed, play:paused, result |
| Ctrl+F | 2 | settings:speed, result |
| F2 | 1 | settings:speed |
| F3 | 3 | settings:speed, play:paused, result |
| F4 | 3 | settings:speed, play:paused, result |
| F5 | 2 | settings:speed, play:paused |
| F6 | 2 | settings:speed, play:paused |
| F10 | 2 | settings:speed, play:paused |

## 패드

### 입력마다

#### 패드 A

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → play:running |  |  |  |
| select+options:rules | → play:running | 플레이 |  |  |
| select+info | → play:running | 플레이 |  |  |
| play:paused | → play:running |  |  | 브라우저 기본 동작 남음 |
| result | → select | 선곡으로 |  | 브라우저 기본 동작 남음 |
| select+options:generation | → play:running | 플레이 |  |  |
| select+options:gear | → play:running | 플레이 |  |  |
| select+options:rules+practice | → play:running | 플레이 |  |  |
| select+info+sections | → select+info | 누르기 |  |  |
| select+info+youtube |  | 플레이 |  | 브라우저 기본 동작 남음 |
| select+info+analysis | → select+info | 누르기 |  |  |
| calibration:input | → calibration:input+running | 시작 |  | 브라우저 기본 동작 남음 |
| calibration:visual | 화면 바뀜 | 저장 |  | 브라우저 기본 동작 남음 |
| settings:judge | 설정 judgementMode | 열기 |  |  |
| settings:gear | 설정 parts |  |  |  |

#### 패드 B

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+options:rules | → select | 닫기 |  | 브라우저 기본 동작 남음 |
| select+info | → select | 닫기 |  | 브라우저 기본 동작 남음 |
| settings:speed | → select | 완료 |  |  |
| play:paused | → play:running |  |  |  |
| result | → select |  |  |  |
| select+options:generation | → select | 닫기 |  | 브라우저 기본 동작 남음 |
| select+options:gear | → select | 닫기 |  | 브라우저 기본 동작 남음 |
| select+options:rules+practice | → select | 닫기 |  | 브라우저 기본 동작 남음 |
| editor | → select |  |  | 브라우저 기본 동작 남음 |
| select+info+sections | → select | 닫기 |  | 브라우저 기본 동작 남음 |
| select+info+youtube | → select+info | 닫기 |  | 브라우저 기본 동작 남음 |
| select+info+analysis | → select | 닫기 |  | 브라우저 기본 동작 남음 |
| calibration:input | → select | 돌아가기 |  |  |
| calibration:visual | → select | 돌아가기 |  |  |
| settings:judge | → select | 완료 |  |  |
| settings:gear | → select | 완료 |  |  |

#### 패드 X

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → select+options:rules |  |  |  |
| select+options:rules | → select | 플레이 옵션 닫기 |  |  |
| select+info | → select+options:rules | 플레이 옵션 |  |  |
| result | → play:running | 다시 하기 |  |  |
| select+options:generation | → select | 플레이 옵션 닫기 |  |  |
| select+options:gear | → select | 플레이 옵션 닫기 |  |  |
| select+options:rules+practice | → select | 플레이 옵션 닫기 |  |  |
| select+info+sections | → select+options:rules | 플레이 옵션 |  |  |
| select+info+youtube |  | 플레이 옵션 |  | 브라우저 기본 동작 남음 |
| select+info+analysis | → select+options:rules | 플레이 옵션 |  |  |

#### 패드 Y

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 설정 lastKeyMode |  |  |  |
| select+options:rules | 설정 lastKeyMode |  |  |  |
| select+info | 설정 lastKeyMode · 포커스 → song-info>div[1]:채보 정보노트 87롱노트 9평균 / 최대 N |  |  |  |
| settings:speed | 포커스 → opt-sudden |  |  | 브라우저 기본 동작 남음 |
| play:paused | 포커스 → pause-menu>button[1]:다시 하기 R |  |  | 브라우저 기본 동작 남음 |
| result | 포커스 → result-retry |  |  | 브라우저 기본 동작 남음 |
| select+options:generation | 설정 lastKeyMode |  |  |  |
| select+options:gear | 설정 lastKeyMode |  |  |  |
| select+options:rules+practice | → select+options:rules |  |  |  |
| editor | 포커스 → editor-exit |  |  | 브라우저 기본 동작 남음 |
| select+info+sections | 설정 lastKeyMode |  |  |  |
| select+info+youtube | 포커스 → bga-youtube-form>button[0]:취소 |  |  | 브라우저 기본 동작 남음 |
| select+info+analysis | 설정 lastKeyMode |  |  |  |
| calibration:input | 포커스 → calib-next |  |  | 브라우저 기본 동작 남음 |
| calibration:visual | 포커스 → calib-back |  |  | 브라우저 기본 동작 남음 |
| settings:judge | 포커스 → opt-input-offset |  |  | 브라우저 기본 동작 남음 |
| settings:gear | 포커스 → opt-hud-type |  |  | 브라우저 기본 동작 남음 |

#### 패드 LB

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+options:rules | → select+options:generation | 탭 |  |  |
| settings:speed | → settings:judge | 탭 |  |  |
| select+options:generation | → select+options:gear | 탭 |  |  |
| select+options:gear | → select+options:rules | 탭 |  |  |
| select+options:rules+practice | → select+options:generation | 탭 |  |  |
| calibration:input | → calibration:visual | 단계 |  |  |
| calibration:visual | → calibration:input | 단계 |  |  |
| settings:judge | → settings:play | 탭 |  |  |
| settings:gear | → settings:speed | 탭 |  |  |

#### 패드 RB

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+options:rules | → select+options:gear | 탭 |  |  |
| settings:speed | → settings:gear | 탭 |  |  |
| select+options:generation | → select+options:rules | 탭 |  |  |
| select+options:gear | → select+options:generation | 탭 |  |  |
| select+options:rules+practice | → select+options:gear | 탭 |  |  |
| calibration:input | → calibration:visual | 단계 |  |  |
| calibration:visual | → calibration:input | 단계 |  |  |
| settings:judge | → settings:speed | 탭 |  |  |
| settings:gear | → settings:notes | 탭 |  |  |

#### 패드 LT

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → select+info |  |  | 브라우저 기본 동작 남음 |
| select+options:rules | → select+info | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+info | → select | 곡 정보·도구 닫기 |  | 브라우저 기본 동작 남음 |
| select+options:generation | → select+info | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+options:gear | → select+info | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+options:rules+practice | → select+info | 곡 정보·도구 |  | 브라우저 기본 동작 남음 |
| select+info+sections | → select | 곡 정보·도구 닫기 |  | 브라우저 기본 동작 남음 |
| select+info+youtube |  | 곡 정보·도구 닫기 |  | 브라우저 기본 동작 남음 |
| select+info+analysis | → select | 곡 정보·도구 닫기 |  | 브라우저 기본 동작 남음 |

#### 패드 RT

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → settings:speed |  |  |  |
| select+options:rules | → settings:speed |  |  |  |
| select+info | → settings:speed |  |  |  |
| select+options:generation | → settings:speed |  |  |  |
| select+options:gear | → settings:speed |  |  |  |
| select+options:rules+practice | → settings:speed |  |  |  |
| select+info+sections | → settings:speed |  |  |  |
| select+info+youtube | → settings:speed |  |  |  |
| select+info+analysis | → settings:speed |  |  |  |

#### 패드 Back

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select+options:rules | → select |  |  | 브라우저 기본 동작 남음 |
| select+info | → select |  |  | 브라우저 기본 동작 남음 |
| settings:speed | → select |  |  |  |
| result | → select |  |  |  |
| select+options:generation | → select |  |  | 브라우저 기본 동작 남음 |
| select+options:gear | → select |  |  | 브라우저 기본 동작 남음 |
| select+options:rules+practice | → select |  |  | 브라우저 기본 동작 남음 |
| editor | → select |  |  | 브라우저 기본 동작 남음 |
| select+info+sections | → select |  |  | 브라우저 기본 동작 남음 |
| select+info+youtube | → select+info |  |  | 브라우저 기본 동작 남음 |
| select+info+analysis | → select |  |  | 브라우저 기본 동작 남음 |
| calibration:input | → select |  |  |  |
| calibration:visual | → select |  |  |  |
| settings:judge | → select |  |  |  |
| settings:gear | → select |  |  |  |

#### 패드 Start

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → play:running |  |  |  |
| play:running | → play:paused |  |  |  |
| select+options:rules | → play:running |  |  |  |
| select+info | → play:running |  |  |  |
| play:paused | → play:running |  |  |  |
| result | → select |  |  | 브라우저 기본 동작 남음 |
| select+options:generation | → play:running |  |  |  |
| select+options:gear | → play:running |  |  |  |
| select+options:rules+practice | → play:running |  |  |  |
| select+info+sections | → select+info |  |  |  |
| select+info+analysis | → select+info |  |  |  |
| calibration:input | → calibration:input+running |  |  | 브라우저 기본 동작 남음 |
| calibration:visual | 화면 바뀜 |  |  | 브라우저 기본 동작 남음 |
| settings:judge | 설정 judgementMode |  |  |  |
| settings:gear | 설정 parts |  |  |  |

#### 패드 RS

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | → play:running |  |  |  |
| select+options:rules | → play:running | 오토 플레이 |  |  |
| select+info | → play:running | 오토 플레이 |  |  |
| select+options:generation | → play:running | 오토 플레이 |  |  |
| select+options:gear | → play:running | 오토 플레이 |  |  |
| select+options:rules+practice | → play:running | 오토 플레이 |  |  |
| select+info+sections | → play:running |  |  |  |
| select+info+youtube |  | 오토 플레이 |  | 브라우저 기본 동작 남음 |
| select+info+analysis | → play:running |  |  |  |

#### 패드 Up

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select |  | 곡 |  |  |
| select+options:rules | 포커스 → toggle-rules | 항목 |  |  |
| select+info | 포커스 → edit-chart | 항목 |  |  |
| settings:speed |  | 항목 |  |  |
| play:paused | 포커스 → pause-menu>button[2]:나가기 Q |  |  |  |
| result | 포커스 → download-replay |  |  | 브라우저 기본 동작 남음 |
| select+options:generation | 포커스 → toggle-generation | 항목 |  |  |
| select+options:gear | 포커스 → toggle-gear | 항목 |  |  |
| select+options:rules+practice | 포커스 → target-level | 항목 |  |  |
| editor | 화면 바뀜 | 커서 |  |  |
| select+info+sections | 포커스 → bga-upload | 항목 |  |  |
| select+info+youtube | 포커스 → bga-youtube | 항목 |  | 브라우저 기본 동작 남음 |
| select+info+analysis | 포커스 → edit-sections | 항목 |  |  |
| calibration:input | 포커스 → calib-step-visual |  |  | 브라우저 기본 동작 남음 |
| calibration:visual | 포커스 → calib-step-visual |  |  | 브라우저 기본 동작 남음 |
| settings:judge |  | 항목 |  |  |
| settings:gear |  | 항목 |  |  |

#### 패드 Down

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select |  | 곡 |  |  |
| select+options:rules | 포커스 → rule-gauge | 항목 |  |  |
| select+info | 포커스 → edit-chart | 항목 |  |  |
| settings:speed | 포커스 → opt-sudden | 항목 |  |  |
| play:paused | 포커스 → pause-menu>button[1]:다시 하기 R |  |  |  |
| result | 포커스 → result-retry |  |  | 브라우저 기본 동작 남음 |
| select+options:generation | 포커스 → generation-options>button[0]:자동 | 항목 |  |  |
| select+options:gear | 포커스 → quick-sudden | 항목 |  |  |
| select+options:rules+practice | 포커스 → practice-rate | 항목 |  |  |
| editor | 화면 바뀜 | 커서 |  |  |
| select+info+sections | 포커스 → section-row>select[0]:구간 | 항목 |  |  |
| select+info+youtube | 포커스 → bga-youtube-form>button[0]:취소 | 항목 |  | 브라우저 기본 동작 남음 |
| select+info+analysis | 포커스 → sync-auto | 항목 |  |  |
| calibration:input | 포커스 → calib-next |  |  | 브라우저 기본 동작 남음 |
| calibration:visual | 포커스 → calib-back |  |  | 브라우저 기본 동작 남음 |
| settings:judge | 포커스 → opt-input-offset | 항목 |  |  |
| settings:gear | 포커스 → opt-hud-type | 항목 |  |  |

#### 패드 Left

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 설정 lastDifficulty | 난이도 |  |  |
| select+options:rules | 설정 placement | 값 |  |  |
| select+info | 포커스 → edit-chart | 값 |  |  |
| settings:speed | 설정 hiSpeed | 값 |  |  |
| play:paused | 포커스 → pause-menu>button[2]:나가기 Q |  |  | 브라우저 기본 동작 남음 |
| result | 포커스 → download-replay |  |  | 브라우저 기본 동작 남음 |
| select+options:generation | 설정 generation · 포커스 → style-melody | 값 |  |  |
| select+options:gear | 설정 hiSpeed | 값 |  |  |
| select+options:rules+practice | → select+options:rules | 값 |  |  |
| editor | 포커스 → editor-test |  |  | 브라우저 기본 동작 남음 |
| select+info+sections |  | 값 |  |  |
| select+info+youtube | 포커스 → bga-youtube | 값 |  | 브라우저 기본 동작 남음 |
| select+info+analysis |  | 값 |  |  |
| calibration:input | 포커스 → calib-step-visual |  |  | 브라우저 기본 동작 남음 |
| calibration:visual | 화면 바뀜 | 1ms |  |  |
| settings:judge | 설정 judgementMode | 값 |  |  |
| settings:gear | 설정 parts | 값 |  |  |

#### 패드 Right

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| select | 설정 lastDifficulty | 난이도 |  |  |
| select+options:rules | 설정 placement | 값 |  |  |
| select+info | 포커스 → edit-chart | 값 |  |  |
| settings:speed | 설정 hiSpeed | 값 |  |  |
| play:paused | 포커스 → pause-menu>button[1]:다시 하기 R |  |  | 브라우저 기본 동작 남음 |
| result | 포커스 → result-retry |  |  | 브라우저 기본 동작 남음 |
| select+options:generation | 설정 generation · 포커스 → style-stream | 값 |  |  |
| select+options:gear | 설정 hiSpeed | 값 |  |  |
| select+options:rules+practice | → select+options:rules | 값 |  |  |
| editor | 포커스 → editor-exit |  |  | 브라우저 기본 동작 남음 |
| select+info+sections |  | 값 |  |  |
| select+info+youtube | 포커스 → bga-youtube-form>button[0]:취소 | 값 |  | 브라우저 기본 동작 남음 |
| select+info+analysis | 포커스 → remove-song | 값 |  |  |
| calibration:input | 포커스 → calib-next |  |  | 브라우저 기본 동작 남음 |
| calibration:visual | 화면 바뀜 | 1ms |  |  |
| settings:judge | 설정 judgementMode | 값 |  |  |
| settings:gear | 설정 parts | 값 |  |  |

#### wait:end

| 상태 | 한 일 | 힌트 바의 말 | 화면의 키 표시 |  |
|---|---|---|---|---|
| play:running | → result |  |  |  |

### 힌트가 말하는데 첫 포커스에서 아무 일도 없던 키

| 상태 | 키 | 힌트 | 첫 포커스 |
|---|---|---|---|
| select | 패드 Up | 곡 | (none) |
| select | 패드 Down | 곡 | (none) |
| settings:speed | 패드 Up | 항목 | opt-hi-speed |
| select+info+sections | 패드 Left | 값 | edit-sections |
| select+info+sections | 패드 Right | 값 | edit-sections |
| select+info+youtube | 패드 X | 플레이 옵션 | bga-youtube-input |
| select+info+youtube | 패드 LT | 곡 정보·도구 닫기 | bga-youtube-input |
| select+info+youtube | 패드 RS | 오토 플레이 | bga-youtube-input |
| select+info+youtube | 패드 A | 플레이 | bga-youtube-input |
| select+info+analysis | 패드 Left | 값 | toggle-analysis |
| settings:judge | 패드 Up | 항목 | opt-judgement |
| settings:gear | 패드 Up | 항목 | opt-deck-style |

### 일을 하는데 힌트 바에도 화면의 키 표시에도 없는 키 (숨은 단축키)

| 상태 | 키 | 한 일 |
|---|---|---|
| select | 패드 A | → play:running |
| select | 패드 X | → select+options:rules |
| select | 패드 Y | 설정 lastKeyMode |
| select | 패드 LT | → select+info |
| select | 패드 RT | → settings:speed |
| select | 패드 Start | → play:running |
| select | 패드 RS | → play:running |
| play:running | 패드 Start | → play:paused |
| play:running | wait:end | → result |
| select+options:rules | 패드 Y | 설정 lastKeyMode |
| select+options:rules | 패드 RT | → settings:speed |
| select+options:rules | 패드 Back | → select |
| select+options:rules | 패드 Start | → play:running |
| select+info | 패드 Y | 설정 lastKeyMode · 포커스 → song-info>div[1]:채보 정보노트 87롱노트 9평균 / 최대 N |
| select+info | 패드 RT | → settings:speed |
| select+info | 패드 Back | → select |
| select+info | 패드 Start | → play:running |
| settings:speed | 패드 Y | 포커스 → opt-sudden |
| settings:speed | 패드 Back | → select |
| play:paused | 패드 A | → play:running |
| play:paused | 패드 B | → play:running |
| play:paused | 패드 Y | 포커스 → pause-menu>button[1]:다시 하기 R |
| play:paused | 패드 Start | → play:running |
| result | 패드 B | → select |
| result | 패드 Y | 포커스 → result-retry |
| result | 패드 Back | → select |
| result | 패드 Start | → select |
| select+options:generation | 패드 Y | 설정 lastKeyMode |
| select+options:generation | 패드 RT | → settings:speed |
| select+options:generation | 패드 Back | → select |
| select+options:generation | 패드 Start | → play:running |
| select+options:gear | 패드 Y | 설정 lastKeyMode |
| select+options:gear | 패드 RT | → settings:speed |
| select+options:gear | 패드 Back | → select |
| select+options:gear | 패드 Start | → play:running |
| select+options:rules+practice | 패드 Y | → select+options:rules |
| select+options:rules+practice | 패드 RT | → settings:speed |
| select+options:rules+practice | 패드 Back | → select |
| select+options:rules+practice | 패드 Start | → play:running |
| editor | 패드 B | → select |
| editor | 패드 Y | 포커스 → editor-exit |
| editor | 패드 Back | → select |
| select+info+sections | 패드 Y | 설정 lastKeyMode |
| select+info+sections | 패드 RT | → settings:speed |
| select+info+sections | 패드 Back | → select |
| select+info+sections | 패드 Start | → select+info |
| select+info+sections | 패드 RS | → play:running |
| select+info+youtube | 패드 Y | 포커스 → bga-youtube-form>button[0]:취소 |
| select+info+youtube | 패드 RT | → settings:speed |
| select+info+youtube | 패드 Back | → select+info |
| select+info+analysis | 패드 Y | 설정 lastKeyMode |
| select+info+analysis | 패드 RT | → settings:speed |
| select+info+analysis | 패드 Back | → select |
| select+info+analysis | 패드 Start | → select+info |
| select+info+analysis | 패드 RS | → play:running |
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

### 같은 키, 다른 이름 (힌트 바의 말 기준)

| 키 | 이름 수 | 이름들 | 화면 |
|---|---|---|---|
| 패드 A | 6 | 플레이 / 선곡으로 / 누르기 / 시작 / 저장 / 열기 | select, result, calibration, settings |
| 패드 B | 3 | 닫기 / 완료 / 돌아가기 | select, settings, calibration |
| 패드 X | 3 | 플레이 옵션 닫기 / 플레이 옵션 / 다시 하기 | select, result |
| 패드 Up | 3 | 곡 / 항목 / 커서 | select, settings, editor |
| 패드 Down | 3 | 곡 / 항목 / 커서 | select, settings, editor |
| 패드 Left | 3 | 난이도 / 값 / 1ms | select, settings, calibration |
| 패드 Right | 3 | 난이도 / 값 / 1ms | select, settings, calibration |
| 패드 LB | 2 | 탭 / 단계 | select, settings, calibration |
| 패드 RB | 2 | 탭 / 단계 | select, settings, calibration |
| 패드 LT | 2 | 곡 정보·도구 / 곡 정보·도구 닫기 | select |
