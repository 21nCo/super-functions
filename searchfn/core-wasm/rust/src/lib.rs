use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::cell::RefCell;
use std::cmp::Ordering;
use std::collections::HashMap;

const MAGIC: [u8; 4] = *b"SFP1";
const FLAG_IS_PREFIX: u8 = 0b0000_0001;
const FLAG_HAS_EXTRA_METADATA: u8 = 0b0000_0010;
const DEFAULT_K1: f64 = 1.2;
const DEFAULT_B: f64 = 0.75;
const DEFAULT_D: f64 = 0.5;
const PREFIX_MATCH_PENALTY: f64 = 0.7;

thread_local! {
    static OUTPUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    static LAST_ERROR: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

#[derive(Debug, Deserialize)]
struct InputPosting {
    #[serde(rename = "docId")]
    doc_id: String,
    #[serde(rename = "termFrequency", default = "default_term_frequency")]
    term_frequency: u32,
    #[serde(default)]
    metadata: Option<Map<String, Value>>,
}

#[derive(Debug, Serialize, PartialEq)]
struct OutputPosting {
    #[serde(rename = "docId")]
    doc_id: String,
    #[serde(rename = "termFrequency")]
    term_frequency: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<Map<String, Value>>,
}

#[derive(Debug, Deserialize)]
struct ScoreRequest {
    chunks: Vec<ScoreChunk>,
    #[serde(rename = "documentLengths", default)]
    document_lengths: HashMap<String, f64>,
    #[serde(rename = "averageDocLength")]
    average_doc_length: f64,
    #[serde(default)]
    options: Option<ScoreOptions>,
    #[serde(default)]
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct ScoreChunk {
    #[serde(rename = "docFrequency")]
    doc_frequency: u32,
    #[serde(rename = "inverseDocumentFrequency")]
    inverse_document_frequency: Option<f64>,
    postings: Vec<ScorePosting>,
}

#[derive(Debug, Deserialize)]
struct ScorePosting {
    #[serde(rename = "docId")]
    doc_id: String,
    #[serde(rename = "termFrequency", default = "default_score_term_frequency")]
    term_frequency: f64,
    #[serde(default)]
    metadata: Option<Map<String, Value>>,
}

#[derive(Debug, Deserialize)]
struct ScoreOptions {
    k1: Option<f64>,
    b: Option<f64>,
    d: Option<f64>,
}

#[derive(Debug, Serialize, PartialEq)]
struct ScoredDocument {
    #[serde(rename = "docId")]
    doc_id: String,
    score: f64,
}

fn default_term_frequency() -> u32 {
    1
}

fn default_score_term_frequency() -> f64 {
    1.0
}

#[unsafe(no_mangle)]
pub extern "C" fn searchfn_wasm_abi_version() -> u32 {
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn searchfn_alloc(len: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(len.max(1));
    let ptr = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    ptr
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn searchfn_free(ptr: *mut u8, capacity: usize) {
    if ptr.is_null() || capacity == 0 {
        return;
    }
    let _ = unsafe { Vec::from_raw_parts(ptr, 0, capacity) };
}

#[unsafe(no_mangle)]
pub extern "C" fn searchfn_encode_postings_json(ptr: *const u8, len: usize) -> u32 {
    match read_input(ptr, len)
        .and_then(|bytes| serde_json::from_slice::<Vec<InputPosting>>(bytes).map_err(|err| err.to_string()))
        .and_then(|postings| encode_postings_binary(&postings))
    {
        Ok(bytes) => {
            set_output(bytes);
            clear_error();
            1
        }
        Err(error) => {
            set_error(error);
            0
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn searchfn_decode_postings_to_json(ptr: *const u8, len: usize) -> u32 {
    match read_input(ptr, len)
        .and_then(decode_postings_binary)
        .and_then(|postings| serde_json::to_vec(&postings).map_err(|err| err.to_string()))
    {
        Ok(bytes) => {
            set_output(bytes);
            clear_error();
            1
        }
        Err(error) => {
            set_error(error);
            0
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn searchfn_score_documents_json(ptr: *const u8, len: usize) -> u32 {
    match read_input(ptr, len)
        .and_then(|bytes| serde_json::from_slice::<ScoreRequest>(bytes).map_err(|err| err.to_string()))
        .and_then(|request| score_documents(&request))
        .and_then(|documents| serde_json::to_vec(&documents).map_err(|err| err.to_string()))
    {
        Ok(bytes) => {
            set_output(bytes);
            clear_error();
            1
        }
        Err(error) => {
            set_error(error);
            0
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn searchfn_get_output_ptr() -> *const u8 {
    OUTPUT.with(|output| output.borrow().as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn searchfn_get_output_len() -> usize {
    OUTPUT.with(|output| output.borrow().len())
}

#[unsafe(no_mangle)]
pub extern "C" fn searchfn_get_last_error_ptr() -> *const u8 {
    LAST_ERROR.with(|error| error.borrow().as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn searchfn_get_last_error_len() -> usize {
    LAST_ERROR.with(|error| error.borrow().len())
}

fn read_input<'a>(ptr: *const u8, len: usize) -> Result<&'a [u8], String> {
    if len == 0 {
        return Ok(&[]);
    }
    if ptr.is_null() {
        return Err("Received null pointer for non-empty input.".to_string());
    }

    Ok(unsafe { std::slice::from_raw_parts(ptr, len) })
}

fn set_output(bytes: Vec<u8>) {
    OUTPUT.with(|output| {
        *output.borrow_mut() = bytes;
    });
}

fn clear_error() {
    LAST_ERROR.with(|error| error.borrow_mut().clear());
}

fn set_error(message: String) {
    LAST_ERROR.with(|error| {
        *error.borrow_mut() = message.into_bytes();
    });
}

fn encode_postings_binary(postings: &[InputPosting]) -> Result<Vec<u8>, String> {
    let mut output = Vec::new();
    output.extend_from_slice(&MAGIC);
    output.extend_from_slice(&(postings.len() as u32).to_le_bytes());

    for posting in postings {
        let doc_id_bytes = posting.doc_id.as_bytes();
        output.extend_from_slice(&(doc_id_bytes.len() as u32).to_le_bytes());
        output.extend_from_slice(doc_id_bytes);
        output.extend_from_slice(&normalise_term_frequency(posting.term_frequency).to_le_bytes());

        let (flags, extra_metadata) = encode_metadata(posting.metadata.as_ref())?;
        output.push(flags);

        if let Some(metadata_bytes) = extra_metadata {
            output.extend_from_slice(&(metadata_bytes.len() as u32).to_le_bytes());
            output.extend_from_slice(&metadata_bytes);
        }
    }

    Ok(output)
}

fn decode_postings_binary(bytes: &[u8]) -> Result<Vec<OutputPosting>, String> {
    if bytes.is_empty() {
        return Ok(Vec::new());
    }
    if bytes.len() < MAGIC.len() + 4 {
        return Err("Invalid posting-bin-v1 payload".to_string());
    }
    if bytes[..MAGIC.len()] != MAGIC {
        return Err("Invalid posting-bin-v1 header".to_string());
    }

    let mut offset = MAGIC.len();
    let count = read_u32(bytes, &mut offset)? as usize;
    let remaining_bytes = bytes.len().saturating_sub(offset);
    if count > remaining_bytes / 9 {
        return Err("Invalid posting-bin-v1 payload length".to_string());
    }
    let mut postings = Vec::with_capacity(count);

    for _ in 0..count {
        let doc_id_length = read_u32(bytes, &mut offset)? as usize;
        if offset + doc_id_length > bytes.len() {
            return Err("Invalid posting-bin-v1 docId length".to_string());
        }
        let doc_id = std::str::from_utf8(&bytes[offset..offset + doc_id_length])
            .map_err(|_| "Invalid UTF-8 in posting-bin-v1 docId".to_string())?
            .to_string();
        offset += doc_id_length;

        let term_frequency = normalise_term_frequency(read_u32(bytes, &mut offset)?);
        if offset >= bytes.len() {
            return Err("Invalid posting-bin-v1 payload length".to_string());
        }
        let flags = bytes[offset];
        offset += 1;

        let mut metadata = if flags & FLAG_IS_PREFIX != 0 {
            let mut map = Map::new();
            map.insert("isPrefix".to_string(), Value::Bool(true));
            Some(map)
        } else {
            None
        };

        if flags & FLAG_HAS_EXTRA_METADATA != 0 {
            let metadata_length = read_u32(bytes, &mut offset)? as usize;
            if offset + metadata_length > bytes.len() {
                return Err("Invalid posting-bin-v1 metadata payload".to_string());
            }
            let parsed: Value = serde_json::from_slice(&bytes[offset..offset + metadata_length])
                .map_err(|err| err.to_string())?;
            let parsed_object = parsed
                .as_object()
                .cloned()
                .ok_or_else(|| "Decoded posting-bin-v1 metadata is not an object".to_string())?;
            let target = metadata.get_or_insert_with(Map::new);
            for (key, value) in parsed_object {
                target.insert(key, value);
            }
            offset += metadata_length;
        }

        postings.push(OutputPosting {
            doc_id,
            term_frequency,
            metadata,
        });
    }

    if offset != bytes.len() {
        return Err("Invalid posting-bin-v1 trailing bytes".to_string());
    }

    Ok(postings)
}

fn score_documents(request: &ScoreRequest) -> Result<Vec<ScoredDocument>, String> {
    let average_doc_length = normalise_length(request.average_doc_length);
    let k1 = request
        .options
        .as_ref()
        .and_then(|options| options.k1)
        .unwrap_or(DEFAULT_K1);
    let b = request
        .options
        .as_ref()
        .and_then(|options| options.b)
        .unwrap_or(DEFAULT_B);
    let d = request
        .options
        .as_ref()
        .and_then(|options| options.d)
        .unwrap_or(DEFAULT_D);
    let mut scores: HashMap<String, f64> = HashMap::new();

    for chunk in &request.chunks {
        let idf = chunk
            .inverse_document_frequency
            .unwrap_or_else(|| compute_default_idf(chunk.doc_frequency));
        for posting in &chunk.postings {
            let doc_length = request
                .document_lengths
                .get(&posting.doc_id)
                .copied()
                .map(normalise_length)
                .unwrap_or(average_doc_length);
            let tf = normalise_score_term_frequency(posting.term_frequency);
            let norm = 1.0 - b + (b * doc_length) / average_doc_length.max(1.0);
            let mut score_contribution = idf * (d + ((k1 + 1.0) * tf) / (k1 * norm + tf));

            if metadata_is_prefix(posting.metadata.as_ref()) {
                score_contribution *= PREFIX_MATCH_PENALTY;
            }

            *scores.entry(posting.doc_id.clone()).or_insert(0.0) += score_contribution;
        }
    }

    let mut scored = scores
        .into_iter()
        .map(|(doc_id, score)| ScoredDocument { doc_id, score })
        .collect::<Vec<_>>();

    scored.sort_by(|a, b| match b.score.total_cmp(&a.score) {
        Ordering::Equal => a.doc_id.cmp(&b.doc_id),
        ordering => ordering,
    });

    if let Some(limit) = request.limit {
        scored.truncate(limit);
    }

    Ok(scored)
}

fn compute_default_idf(doc_frequency: u32) -> f64 {
    if doc_frequency == 0 {
        return 0.0;
    }
    (1.0 + 1.0 / doc_frequency as f64).ln()
}

fn metadata_is_prefix(metadata: Option<&Map<String, Value>>) -> bool {
    metadata
        .and_then(|metadata| metadata.get("isPrefix"))
        .and_then(Value::as_bool)
        == Some(true)
}

fn encode_metadata(metadata: Option<&Map<String, Value>>) -> Result<(u8, Option<Vec<u8>>), String> {
    let Some(metadata) = metadata else {
        return Ok((0, None));
    };

    let mut flags = 0;
    let mut extra_metadata = Map::new();

    for (key, value) in metadata {
        if key == "isPrefix" && value == &Value::Bool(true) {
            flags |= FLAG_IS_PREFIX;
            continue;
        }
        extra_metadata.insert(key.clone(), value.clone());
    }

    if extra_metadata.is_empty() && flags != 0 {
        return Ok((flags, None));
    }

    flags |= FLAG_HAS_EXTRA_METADATA;
    let bytes = serde_json::to_vec(&extra_metadata).map_err(|err| err.to_string())?;
    Ok((flags, Some(bytes)))
}

fn read_u32(bytes: &[u8], offset: &mut usize) -> Result<u32, String> {
    if *offset + 4 > bytes.len() {
        return Err("Invalid posting-bin-v1 payload length".to_string());
    }
    let mut raw = [0u8; 4];
    raw.copy_from_slice(&bytes[*offset..*offset + 4]);
    *offset += 4;
    Ok(u32::from_le_bytes(raw))
}

fn normalise_term_frequency(term_frequency: u32) -> u32 {
    term_frequency.max(1)
}

fn normalise_score_term_frequency(term_frequency: f64) -> f64 {
    if !term_frequency.is_finite() || term_frequency <= 0.0 {
        return 1.0;
    }
    term_frequency
}

fn normalise_length(length: f64) -> f64 {
    if !length.is_finite() || length <= 0.0 {
        return 1.0;
    }
    length
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_structured_postings() {
        let mut metadata = Map::new();
        metadata.insert("isPrefix".to_string(), Value::Bool(true));
        metadata.insert("section".to_string(), Value::String("intro".to_string()));

        let encoded = encode_postings_binary(&[
            InputPosting {
                doc_id: "doc-1".to_string(),
                term_frequency: 2,
                metadata: Some(metadata),
            },
            InputPosting {
                doc_id: "doc-2".to_string(),
                term_frequency: 1,
                metadata: None,
            },
        ])
        .expect("encode");

        let decoded = decode_postings_binary(&encoded).expect("decode");
        assert_eq!(
            decoded,
            vec![
                OutputPosting {
                    doc_id: "doc-1".to_string(),
                    term_frequency: 2,
                    metadata: Some(Map::from_iter([
                        ("isPrefix".to_string(), Value::Bool(true)),
                        ("section".to_string(), Value::String("intro".to_string())),
                    ])),
                },
                OutputPosting {
                    doc_id: "doc-2".to_string(),
                    term_frequency: 1,
                    metadata: None,
                },
            ]
        );
    }

    #[test]
    fn rejects_invalid_magic_header() {
        let invalid = b"BAD!XXXX".to_vec();
        let result = decode_postings_binary(&invalid);
        assert!(result.is_err());
    }

    #[test]
    fn preserves_explicit_empty_metadata_objects() {
        let encoded = encode_postings_binary(&[InputPosting {
            doc_id: "doc-1".to_string(),
            term_frequency: 1,
            metadata: Some(Map::new()),
        }])
        .expect("encode");

        let decoded = decode_postings_binary(&encoded).expect("decode");
        assert_eq!(
            decoded,
            vec![OutputPosting {
                doc_id: "doc-1".to_string(),
                term_frequency: 1,
                metadata: Some(Map::new()),
            }]
        );
    }

    #[test]
    fn rejects_payloads_with_impossible_record_counts() {
        let invalid = vec![0x53, 0x46, 0x50, 0x31, 0xff, 0xff, 0xff, 0x7f];
        let result = decode_postings_binary(&invalid);
        assert!(result.is_err());
    }

    #[test]
    fn scores_documents_like_the_typescript_engine() {
        let request = ScoreRequest {
            chunks: vec![ScoreChunk {
                doc_frequency: 2,
                inverse_document_frequency: None,
                postings: vec![
                    ScorePosting {
                        doc_id: "doc-1".to_string(),
                        term_frequency: 0.8,
                        metadata: None,
                    },
                    ScorePosting {
                        doc_id: "doc-2".to_string(),
                        term_frequency: 1.6,
                        metadata: Some(Map::from_iter([(
                            "isPrefix".to_string(),
                            Value::Bool(true),
                        )])),
                    },
                ],
            }],
            document_lengths: HashMap::from_iter([
                ("doc-1".to_string(), 4.0),
                ("doc-2".to_string(), 4.0),
            ]),
            average_doc_length: 4.0,
            options: Some(ScoreOptions {
                k1: Some(1.2),
                b: Some(0.75),
                d: Some(0.5),
            }),
            limit: Some(2),
        };

        let scored = score_documents(&request).expect("score");

        assert_eq!(scored.len(), 2);
        assert_eq!(scored[0].doc_id, "doc-1");
        assert_eq!(scored[1].doc_id, "doc-2");
        assert!(scored[0].score > scored[1].score);
    }

    #[test]
    fn honors_limit_and_tie_breaks_by_doc_id() {
        let request = ScoreRequest {
            chunks: vec![ScoreChunk {
                doc_frequency: 2,
                inverse_document_frequency: Some(1.0),
                postings: vec![
                    ScorePosting {
                        doc_id: "b".to_string(),
                        term_frequency: 1.0,
                        metadata: None,
                    },
                    ScorePosting {
                        doc_id: "a".to_string(),
                        term_frequency: 1.0,
                        metadata: None,
                    },
                ],
            }],
            document_lengths: HashMap::new(),
            average_doc_length: 1.0,
            options: None,
            limit: Some(1),
        };

        let scored = score_documents(&request).expect("score");

        assert_eq!(scored, vec![ScoredDocument {
            doc_id: "a".to_string(),
            score: 1.5,
        }]);
    }
}
