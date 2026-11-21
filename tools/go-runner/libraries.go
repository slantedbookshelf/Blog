package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/traefik/yaegi/interp"
)

func symbols(values map[string]any) map[string]reflect.Value {
	export := make(map[string]reflect.Value, len(values))
	for name, value := range values {
		export[name] = reflect.ValueOf(value)
	}
	return export
}

func availableLibraries(out io.Writer) interp.Exports {
	return interp.Exports{
		"fmt/fmt": symbols(map[string]any{
			"Print":   func(args ...any) (int, error) { return fmt.Fprint(out, args...) },
			"Println": func(args ...any) (int, error) { return fmt.Fprintln(out, args...) },
			"Printf":  func(format string, args ...any) (int, error) { return fmt.Fprintf(out, format, args...) },
			"Sprint":  fmt.Sprint, "Sprintf": fmt.Sprintf, "Errorf": fmt.Errorf,
		}),
		"strings/strings": symbols(map[string]any{
			"TrimSpace": strings.TrimSpace, "ToLower": strings.ToLower, "ToUpper": strings.ToUpper,
			"Contains": strings.Contains, "HasPrefix": strings.HasPrefix, "Join": strings.Join,
			"Split": strings.Split, "Cut": strings.Cut, "Fields": strings.Fields,
			"NewReader": strings.NewReader, "Builder": (*strings.Builder)(nil),
		}),
		"strconv/strconv": symbols(map[string]any{
			"Atoi": strconv.Atoi, "Itoa": strconv.Itoa, "ParseInt": strconv.ParseInt,
		}),
		"sort/sort": symbols(map[string]any{
			"Ints": sort.Ints, "Strings": sort.Strings, "Slice": sort.Slice, "SliceStable": sort.SliceStable,
		}),
		"errors/errors": symbols(map[string]any{"New": errors.New, "Is": errors.Is, "As": errors.As}),
		"encoding/json/json": symbols(map[string]any{
			"Marshal": json.Marshal, "Unmarshal": json.Unmarshal, "NewDecoder": json.NewDecoder,
		}),
		"unicode/utf8/utf8": symbols(map[string]any{
			"RuneCountInString": utf8.RuneCountInString, "ValidString": utf8.ValidString,
		}),
		"context/context": symbols(map[string]any{
			"Context": (*context.Context)(nil), "Background": context.Background, "WithCancel": context.WithCancel,
			"WithTimeout": context.WithTimeout, "Canceled": context.Canceled,
		}),
		"sync/sync": symbols(map[string]any{
			"WaitGroup": (*sync.WaitGroup)(nil), "Mutex": (*sync.Mutex)(nil),
		}),
		"time/time": symbols(map[string]any{
			"Duration": (*time.Duration)(nil), "Millisecond": time.Millisecond, "Second": time.Second,
			"Sleep": time.Sleep, "After": time.After,
		}),
	}
}
