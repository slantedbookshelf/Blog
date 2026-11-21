package main

import (
	"encoding/json"
	"go/parser"
	"go/token"
	"reflect"
	"strconv"
	"strings"
	"syscall/js"
	"testing/fstest"

	"github.com/traefik/yaegi/interp"
)

type testCase struct {
	Args     []string        `json:"args"`
	Expected json.RawMessage `json:"expected"`
}

type request struct {
	Code  string     `json:"code"`
	Tests []testCase `json:"tests"`
}

type caseResult struct {
	Passed bool   `json:"passed"`
	Actual string `json:"actual"`
	Error  string `json:"error,omitempty"`
}

type result struct {
	Logs  []string     `json:"logs"`
	Cases []caseResult `json:"cases"`
	Error string       `json:"error,omitempty"`
}

type outputBuffer struct {
	text strings.Builder
}

func (out *outputBuffer) Write(p []byte) (int, error) {
	const maxOutput = 12_000
	if remaining := maxOutput - out.text.Len(); remaining > 0 {
		out.text.Write(p[:min(remaining, len(p))])
		if len(p) > remaining {
			out.text.WriteString("\n（输出已截断）")
		}
	}
	return len(p), nil
}

func (out *outputBuffer) lines() []string {
	text := strings.TrimSuffix(out.text.String(), "\n")
	if text == "" {
		return []string{}
	}
	return strings.Split(text, "\n")
}

func main() {
	global := js.Global()
	out := result{Logs: []string{}, Cases: []caseResult{}}
	var req request
	if err := json.Unmarshal([]byte(global.Get("__goPracticeInput").String()), &req); err != nil {
		out.Error = "无法解析运行请求。"
	} else {
		out = run(req)
	}
	response, err := json.Marshal(out)
	if err != nil {
		response = []byte(`{"logs":[],"cases":[],"error":"无法序列化运行结果。"}`)
	}
	global.Call("__goPracticeOutput", string(response))
}

func run(req request) (out result) {
	buf := &outputBuffer{}
	out.Cases = []caseResult{}
	defer func() {
		out.Logs = buf.lines()
		if recover() != nil {
			out.Error = "Go 解释器运行发生异常。"
		}
	}()
	libraries := availableLibraries(buf)
	file, err := parser.ParseFile(token.NewFileSet(), "lesson.go", req.Code, 0)
	if err != nil {
		out.Error = err.Error()
		return
	}
	if file.Name.Name != "main" {
		out.Error = "请使用 package main。"
		return
	}
	for _, entry := range file.Imports {
		path, _ := strconv.Unquote(entry.Path.Value)
		name := path[strings.LastIndex(path, "/")+1:]
		if _, ok := libraries[path+"/"+name]; !ok {
			out.Error = "练习环境不提供包 " + path + "。请查看运行环境中的支持列表。"
			return
		}
	}
	machine := interp.New(interp.Options{
		Stdout: buf, Stderr: buf,
		SourcecodeFilesystem: fstest.MapFS{},
	})
	if err := machine.Use(libraries); err != nil {
		out.Error = err.Error()
		return
	}
	if _, err := machine.Eval(req.Code); err != nil {
		out.Error = err.Error()
		return
	}
	for _, test := range req.Tests {
		value, err := machine.Eval("solve(" + strings.Join(test.Args, ", ") + ")")
		if err != nil {
			out.Cases = append(out.Cases, caseResult{Actual: "—", Error: err.Error()})
			continue
		}
		if !value.IsValid() {
			out.Cases = append(out.Cases, caseResult{Actual: "—", Error: "solve 必须返回一个值。"})
			continue
		}
		encoded, err := json.Marshal(value.Interface())
		if err != nil {
			out.Cases = append(out.Cases, caseResult{Actual: "—", Error: "返回值必须能转换为 JSON。"})
			continue
		}
		actual := string(encoded)
		if len(actual) > 1600 {
			actual = actual[:1600] + "…"
		}
		out.Cases = append(out.Cases, caseResult{
			Actual: actual, Passed: equalJSON(encoded, test.Expected),
		})
	}
	return
}

func equalJSON(actual, expected []byte) bool {
	decode := func(raw []byte) (any, error) {
		decoder := json.NewDecoder(strings.NewReader(string(raw)))
		decoder.UseNumber()
		var value any
		err := decoder.Decode(&value)
		return value, err
	}
	a, aErr := decode(actual)
	b, bErr := decode(expected)
	return aErr == nil && bErr == nil && reflect.DeepEqual(a, b)
}
